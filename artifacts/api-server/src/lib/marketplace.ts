import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, commonsRecords as records } from "@workspace/db";
import { CreateBidBody, ActOnBidBody } from "@workspace/api-zod";
import { z } from "zod/v4";
import { canRead, quotas, serial } from "./commons";
import { quoteFees } from "./fees";

function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
type Operator = { operatorKind: "human" | "business"; operatorLabel: string; at: string };
type Milestone = { title: string; scope: string; dueAt: string; status: string };
type Event = { id: string; actor: string; action: string; at: string; note?: string; evidenceUrl?: string; milestone?: number; eventId?: string; rating?: number };
type Work = {
  serviceId: string; parentBidId?: string; scope: string; subtotalMinor: number; deadline: string;
  buyer: string; seller: string; participants: string[]; consents: Record<string, Operator>;
  milestones: Milestone[]; quote: ReturnType<typeof quoteFees>; events: Event[];
  reviews: Event[]; resolution?: Event; resolutionAgreements?: string[];
};
function text(value: string) {
  if (!value.trim() || /\x00|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|sk_live_)[A-Za-z0-9]{16,}/.test(value)) fail("Provide meaningful text without credentials or private keys.");
  return value.trim();
}
function operator(kind: unknown, label: unknown, at: string): Operator {
  return { operatorKind: z.enum(["human", "business"]).parse(kind), operatorLabel: text(z.string().min(1).max(100).parse(label)), at };
}
async function locked<T>(actor: string, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  if (!actor) fail("Sign in first.", 401);
  return db.transaction(async tx => {
    // Same lock as community writes: quotas and generic listing edits cannot race agreements.
    await tx.execute(sql`select pg_advisory_xact_lock(87148341)`);
    return fn(tx);
  });
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function get(tx: Tx, id: string) {
  if (!z.uuid().safeParse(id).success) fail("Record not found.", 404);
  const [r] = await tx.select().from(records).where(eq(records.id, id));
  if (!r) fail("Record not found.", 404);
  return r;
}
export async function createBid(actor: string, input: unknown) {
  return locked(actor, async tx => {
    const v = CreateBidBody.parse(input);
    if (v.consent !== true) fail("Explicit operator consent is required.");
    const at = new Date().toISOString();
    const identity = operator(v.operatorKind, v.operatorLabel, at);
    const service = await get(tx, v.serviceId);
    if (service.kind !== "service" || service.status !== "approved" || !canRead(service, actor)) fail("Approved service not found.", 404);
    const deadline = v.deadline.getTime();
    if (!Number.isFinite(deadline) || deadline <= Date.now() || deadline > Date.now() + 365 * 86400000) fail("Deadline must be within the next year.");
    if (v.milestones.length < 1 || v.milestones.length > 20) fail("Provide 1–20 milestones.");
    const milestones = v.milestones.map(m => {
      const due = m.dueAt.getTime();
      if (!Number.isFinite(due) || due <= Date.now() || due > deadline) fail("Milestone deadlines must be future dates within the agreement deadline.");
      return { title: text(m.title), scope: text(m.scope), dueAt: m.dueAt.toISOString(), status: "pending" };
    });
    let buyer = service.data.offerType === "offer" ? actor : service.owner;
    let seller = service.data.offerType === "offer" ? service.owner : actor;
    let participants = [buyer, seller];
    if (v.parentBidId) {
      const parent = await get(tx, v.parentBidId);
      const p = parent.data as unknown as Work;
      if (parent.kind !== "bid" || !canRead(parent, actor) || p.seller !== actor || parent.status !== "active") fail("Only an active agreement's seller can propose a subcontract.", 403);
      if (p.parentBidId) fail("Further subcontract tiers are not supported.");
      if (p.serviceId !== service.id || deadline > Date.parse(p.deadline)) fail("Subcontract must reference the same service and stay within the upstream deadline.");
      buyer = actor;
      seller = z.string().regex(/^[0-9a-f]{64}$/).parse(v.sellerSubject);
      if (p.participants.includes(seller)) fail("Choose a separate accountable subcontract operator.");
      participants = [buyer, seller, p.buyer];
    } else if (v.sellerSubject) fail("Seller selection is only allowed for scoped subcontracts.");
    if (buyer === seller) fail("Self bids are not permitted.");
    const mine = await tx.select({ id: records.id }).from(records).where(eq(records.owner, actor));
    if (mine.length >= quotas.records) fail("Record quota reached.", 429);
    const event: Event = { id: randomUUID(), actor, action: "consent", at, note: "Proposed immutable terms; no financial authorization." };
    const data: Work = {
      serviceId: service.id, ...(v.parentBidId ? { parentBidId: v.parentBidId } : {}),
      scope: text(v.scope), subtotalMinor: v.subtotalMinor, deadline: v.deadline.toISOString(), buyer, seller, participants,
      consents: { [actor]: identity }, milestones, quote: quoteFees(v.subtotalMinor), events: [event], reviews: [],
    };
    const [r] = await tx.insert(records).values({ id: randomUUID(), kind: "bid", title: service.title, body: data.scope, owner: actor, status: "proposed", data: data as unknown as Record<string, unknown> }).returning();
    return serial(r);
  });
}

export async function actOnBid(actor: string, id: string, input: unknown) {
  return locked(actor, async tx => {
    const v = ActOnBidBody.parse(input);
    const r = await get(tx, id);
    if (r.kind !== "bid" || !canRead(r, actor)) fail("Agreement not found.", 404);
    const w = r.data as unknown as Work;
    if (w.events.length >= 400) fail("Agreement audit quota reached; contact the operator before further action.", 429);
    let status = r.status;
    const at = new Date().toISOString();
    const event: Event = { id: randomUUID(), actor, action: v.action, at };
    if (v.note !== undefined) event.note = text(v.note);
    if (v.evidenceUrl !== undefined) {
      const url = new URL(text(v.evidenceUrl));
      if (url.protocol !== "https:" || url.username || url.password) fail("Evidence requires an HTTPS URL without credentials. Links are not fetched.");
      event.evidenceUrl = url.href;
    }
    if (v.eventId !== undefined) event.eventId = v.eventId;
    if (v.milestone !== undefined) event.milestone = v.milestone;
    const principal = actor === w.buyer || actor === w.seller;
    const reference = () => {
      const e = w.events.find(e => e.id === v.eventId);
      if (!e) fail("Select an existing evidence event.");
      return e;
    };
    const note = () => { if (!event.note) fail("A substantive explanation is required."); };
    if (v.action === "consent") {
      if (status !== "proposed" || w.consents[actor]) fail("Consent is already recorded or agreement is no longer proposed.", 409);
      if (Date.parse(w.deadline) <= Date.now() || w.milestones.some(m => Date.parse(m.dueAt) <= Date.now())) fail("Terms have expired; propose new deadlines.", 409);
      if (w.parentBidId) {
        const parent = await get(tx, w.parentBidId);
        if (parent.status !== "active") fail("Upstream agreement is no longer active.", 409);
      }
      w.consents[actor] = operator(v.operatorKind, v.operatorLabel, at);
      if (w.participants.every(p => w.consents[p])) status = "active";
    } else if (v.action === "withdraw") {
      if (status !== "proposed") fail("Only a proposed agreement can be withdrawn.", 409);
      note(); status = "withdrawn";
    } else if (["deliver", "accept", "reject"].includes(v.action)) {
      if (status !== "active") fail("Work must be active with every required consent.", 409);
      const m = v.milestone === undefined ? undefined : w.milestones[v.milestone];
      if (!m) fail("Select a milestone.");
      note();
      if (v.action === "deliver") {
        if (actor !== w.seller) fail("Only the accountable seller can deliver.", 403);
        if (!["pending", "rejected"].includes(m.status)) fail("This milestone cannot be delivered again.", 409);
        if (typeof v.executable !== "boolean") fail("Declare whether the delivery includes executable material.");
        if (v.executable) fail("Executable delivery blocked: independently isolated sandbox validation is unavailable. No code was executed or delivered.", 503);
        event.note = `${event.note}\nManual, non-executable evidence only; no sandbox or code-execution claim.`;
        m.status = "delivered";
      } else {
        if (actor !== w.buyer) fail("Only the accountable buyer can accept or reject.", 403);
        if (m.status !== "delivered") fail("No pending delivery for this milestone.", 409);
        const latest = w.events.filter(e => e.action === "deliver" && e.milestone === v.milestone).at(-1);
        if (!latest || v.eventId !== latest.id) fail("Delivery changed; review the latest evidence.", 409);
        m.status = v.action === "accept" ? "accepted" : "rejected";
        if (w.milestones.every(m => m.status === "accepted")) status = "completed";
      }
    } else if (v.action === "dispute") {
      if (!principal) fail("Only buyer or seller may open a dispute.", 403);
      if (!["active", "completed"].includes(status)) fail("Agreement cannot be disputed in this state.", 409);
      note();
      if (!["deliver", "accept", "reject", "evidence"].includes(reference().action)) fail("Reference delivery or decision evidence.");
      status = "disputed";
    } else if (["evidence", "propose-resolution", "agree-resolution"].includes(v.action)) {
      if (!principal || status !== "disputed") fail("Only the disputed agreement's buyer and seller can act.", 403);
      if (v.action === "evidence") note();
      else if (v.action === "propose-resolution") {
        note(); w.resolution = event; w.resolutionAgreements = [actor];
      } else {
        if (!w.resolution || v.eventId !== w.resolution.id || w.resolutionAgreements?.includes(actor)) fail("Review the current resolution; duplicate/stale agreement refused.", 409);
        w.resolutionAgreements = [...(w.resolutionAgreements ?? []), actor];
        if ([w.buyer, w.seller].every(p => w.resolutionAgreements!.includes(p))) status = "resolved";
      }
    } else if (v.action === "review") {
      if (!principal || !["completed", "resolved"].includes(status)) fail("Reviews require a completed or mutually resolved agreement.", 409);
      if (w.reviews.some(e => e.actor === actor)) fail("You already reviewed this agreement.", 409);
      note();
      if (!["accept", "agree-resolution"].includes(reference().action)) fail("Review must cite an acceptance or mutually agreed resolution.");
      event.rating = z.number().int().min(1).max(5).parse(v.rating);
      w.reviews.push(event);
    } else fail("Unsupported agreement action.");
    w.events.push(event);
    const [updated] = await tx.update(records).set({ status, data: w as unknown as Record<string, unknown> }).where(eq(records.id, id)).returning();
    return serial(updated);
  });
}
