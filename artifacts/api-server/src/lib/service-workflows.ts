import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { commonsRecords as records, type CommonsRecordRow } from "@workspace/db";
import {
  SubmitServiceBidBody,
  ActOnServiceAgreementBody,
  ReviewServiceAgreementBody,
} from "@workspace/api-zod";
import { z } from "zod/v4";
import {
  assertRecordCapacity, findRecordForUpdate, isParty, serial,
  withCommonsLock, type CommonsTx,
} from "./commons";
import { quoteFees } from "./fees";

const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const credentialPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|sk_live_)[A-Za-z0-9]{16,}/;
function clean(value: string) {
  if (/\x00/.test(value) || credentialPattern.test(value)) fail("Do not submit credentials or private keys.");
  return value;
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("deliver"), milestoneId: z.uuid(), deliveryText: z.string().min(1).max(10000) }).strict(),
  z.object({ action: z.literal("accept_milestone"), milestoneId: z.uuid() }).strict(),
  z.object({ action: z.literal("request_revision"), milestoneId: z.uuid(), reason: z.string().min(10).max(2000) }).strict(),
  z.object({ action: z.literal("open_dispute"), milestoneId: z.uuid(), reason: z.string().min(10).max(2000) }).strict(),
  z.object({ action: z.literal("add_dispute_evidence"), disputeId: z.uuid(), reason: z.string().min(10).max(2000) }).strict(),
  z.object({ action: z.literal("propose_resolution"), disputeId: z.uuid(), outcome: z.enum(["accept_delivery", "revise", "cancel_agreement"]), reason: z.string().min(10).max(2000) }).strict(),
  z.object({ action: z.literal("accept_resolution"), disputeId: z.uuid() }).strict(),
]);

type Milestone = {
  id: string; title: string; detail: string; amountMinor: number;
  deadlineOffsetDays: number; dueAt: string; status: string;
  deliveryText?: string; deliveredAt?: string; revisionCount: number;
  revisionNotes: { actor: string; text: string; at: string }[];
};
type Dispute = {
  id: string; milestoneId: string; openedBy: string; reason: string; openedAt: string;
  status: "open" | "resolved"; evidence: { actor: string; text: string; at: string }[];
  resolutionProposal?: { actor: string; outcome: "accept_delivery" | "revise" | "cancel_agreement"; reason: string; at: string; counters: number };
  resolvedAt?: string; resolvedBy?: string;
};

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(x => !!x && typeof x === "object") as Record<string, unknown>[] : [];
}
function pushedEvent(data: Record<string, unknown>, actor: string, action: string) {
  const previous = list(data.events);
  if (previous.length >= 200) fail("This work record reached its 200-event audit limit.", 429);
  return [...previous, { action, actor, at: new Date().toISOString() }];
}
function party(row: CommonsRecordRow, actor: string) {
  if (!isParty(row, actor)) fail("Service record not found.", 404);
}
function requireRole(data: Record<string, unknown>, actor: string, role: "buyer" | "seller") {
  if (data[role] !== actor) fail("Only the consenting account assigned to this role may do that.", 403);
}
function getMilestone(data: Record<string, unknown>, id: string) {
  const milestone = list(data.milestones).find(m => m.id === id) as unknown as Milestone | undefined;
  if (!milestone) fail("Milestone not found.", 404);
  return milestone;
}
function replaceMilestone(data: Record<string, unknown>, updated: Milestone) {
  return list(data.milestones).map(m => m.id === updated.id ? updated : m);
}
async function updateRecord(tx: CommonsTx, row: typeof records.$inferSelect, patch: Partial<typeof records.$inferInsert>) {
  const [result] = await tx.update(records).set(patch).where(eq(records.id, row.id)).returning();
  return result;
}

export async function submitServiceBid(actor: string, serviceId: string, input: unknown) {
  if (!actor) fail("Sign in to propose service terms.", 401);
  const v = SubmitServiceBidBody.parse(input);
  const milestoneSchema = z.object({
    title: z.string().trim().min(1).max(80), detail: z.string().max(2000),
    amountMinor: z.number().int().min(1).max(100_000_000),
    deadlineOffsetDays: z.number().int().min(1).max(v.deadlineDays),
  }).strict();
  const milestones = z.array(milestoneSchema).min(1).max(10).parse(v.milestones);
  clean(v.scope); milestones.forEach(m => { clean(m.title); clean(m.detail); });
  if (milestones.reduce((n, m) => n + m.amountMinor, 0) !== v.subtotalMinor)
    fail("Milestone amounts must add up exactly to the proposed service subtotal.");
  for (let i = 1; i < milestones.length; i++)
    if (milestones[i].deadlineOffsetDays <= milestones[i - 1].deadlineOffsetDays)
      fail("Milestone due days must be in strictly increasing order.");
  return withCommonsLock(async tx => {
    const service = await findRecordForUpdate(tx, serviceId);
    if (service.kind !== "service" || service.status !== "approved" || service.data.visibility === "private")
      fail("This service is not accepting proposals.", 404);
    if (service.owner === actor) fail("You cannot bid on your own listing.");
    if (v.deadlineDays > Number(service.data.deadlineDays))
      fail("The proposed deadline exceeds the listing's stated time frame.");
    if (service.data.offerType === "request" && v.subtotalMinor > Number(service.data.subtotalMinor))
      fail("The proposed subtotal exceeds the request's stated budget.");
    const prior = await tx.select().from(records).where(and(
      eq(records.kind, "serviceBid"),
      sql`${records.data}->>'serviceId' = ${serviceId}`,
      eq(records.owner, actor),
    ));
    if (prior.some(r => ["pending", "accepted"].includes(r.status))) fail("You already have an active proposal for this service.", 409);
    const activeBids = await tx.select({ id: records.id }).from(records).where(and(
      eq(records.kind, "serviceBid"),
      sql`${records.data}->>'serviceId' = ${serviceId}`,
      eq(records.status, "pending"),
    ));
    if (activeBids.length >= 30) fail("This listing reached its 30-active-proposal limit.", 429);
    await assertRecordCapacity(tx, actor);
    const id = randomUUID();
    const now = new Date();
    const [bid] = await tx.insert(records).values({
      id, kind: "serviceBid", title: `Proposal for ${service.title}`.slice(0, 120),
      body: v.scope, owner: actor, status: "pending", namespace: null,
      data: {
        serviceId, serviceTitle: service.title, parties: [service.owner, actor],
        subtotalMinor: v.subtotalMinor, deadlineDays: v.deadlineDays, scope: v.scope,
        milestones, expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
        createdAt: now.toISOString(),
        events: [{ action: "submitted", actor, at: now.toISOString() }],
      },
    }).returning();
    return serial(bid);
  });
}

export async function acceptServiceBid(actor: string, serviceId: string, bidId: string) {
  if (!actor) fail("Sign in first.", 401);
  return withCommonsLock(async tx => {
    const service = await findRecordForUpdate(tx, serviceId);
    const bid = await findRecordForUpdate(tx, bidId);
    if (service.kind !== "service" || service.owner !== actor || service.status !== "approved")
      fail("Open service not found.", 404);
    if (bid.kind !== "serviceBid" || bid.status !== "pending" || bid.data.serviceId !== serviceId)
      fail("Open proposal not found.", 404);
    if (Date.parse(String(bid.data.expiresAt)) <= Date.now()) fail("This proposal has expired.", 409);
    const now = new Date();
    const offerType = String(service.data.offerType);
    const buyer = offerType === "request" ? service.owner : bid.owner;
    const seller = offerType === "request" ? bid.owner : service.owner;
    const subtotalMinor = Number(bid.data.subtotalMinor);
    const dueAt = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString();
    const milestones = list(bid.data.milestones).map(m => ({
      ...m, id: randomUUID(), dueAt: dueAt(Number(m.deadlineOffsetDays)),
      status: "pending", revisionCount: 0, revisionNotes: [],
    }));
    const quote = quoteFees(subtotalMinor);
    const updated = await updateRecord(tx, bid, {
      kind: "serviceAgreement", status: "pending",
      data: {
        parties: [buyer, seller], buyer, seller, serviceId, serviceTitle: service.title,
        subtotalMinor, deadlineDays: Number(bid.data.deadlineDays), scope: bid.data.scope,
        milestones, quote, offerType,
        acceptedBy: [service.owner],
        legalBoundary: "Coordination record only. Operators remain responsible for any legal contract. Software-agent accounts are not verified legal payees. GitAI takes no payment or custody.",
        events: pushedEvent(bid.data, actor, "listing-owner-accepted-proposal"),
        disputes: [],
        createdAt: now.toISOString(),
      },
    });
    await tx.update(records).set({ status: "matched" }).where(eq(records.id, service.id));
    return serial(updated);
  });
}

export async function withdrawServiceBid(actor: string, id: string) {
  if (!actor) fail("Sign in first.", 401);
  return withCommonsLock(async tx => {
    const bid = await findRecordForUpdate(tx, id);
    if (bid.kind !== "serviceBid" || bid.owner !== actor) fail("Proposal not found.", 404);
    if (bid.status !== "pending") fail("Only a pending proposal can be withdrawn.", 409);
    return serial(await updateRecord(tx, bid, { status: "withdrawn" }));
  });
}

export async function actOnAgreement(actor: string, id: string, input: unknown) {
  if (!actor) fail("Sign in first.", 401);
  const v = actionSchema.parse(ActOnServiceAgreementBody.parse(input));
  if (v.action === "accept" || v.action === "cancel") {
    return withCommonsLock(async tx => {
      const agreement = await findRecordForUpdate(tx, id);
      if (agreement.kind !== "serviceAgreement") fail("Agreement not found.", 404);
      party(agreement, actor);
      if (v.action === "accept") {
        if (agreement.status !== "pending") fail("This agreement is no longer awaiting consent.", 409);
        const acceptedBy = Array.isArray(agreement.data.acceptedBy) ? agreement.data.acceptedBy as string[] : [];
        if (acceptedBy.includes(actor)) fail("This account has already accepted these terms.", 409);
        const nextAccepted = [...acceptedBy, actor];
        const ready = nextAccepted.length === 2;
        const updated = await updateRecord(tx, agreement, {
          status: ready ? "active" : "pending",
          data: { ...agreement.data, acceptedBy: nextAccepted, startedAt: ready ? new Date().toISOString() : null,
            events: pushedEvent(agreement.data, actor, "accepted-frozen-terms") },
        });
        return serial(updated);
      }
      if (agreement.status !== "pending") fail("An active agreement cannot be cancelled unilaterally; open a dispute and seek consent to a resolution.", 409);
      const updated = await updateRecord(tx, agreement, {
        status: "cancelled",
        data: { ...agreement.data, events: pushedEvent(agreement.data, actor, "cancelled-before-mutual-acceptance") },
      });
      const serviceId = String(agreement.data.serviceId);
      const [service] = await tx.select().from(records).where(eq(records.id, serviceId)).for("update");
      if (service?.kind === "service" && service.status === "matched")
        await tx.update(records).set({ status: "approved" }).where(eq(records.id, serviceId));
      return serial(updated);
    });
  }

  return withCommonsLock(async tx => {
    const agreement = await findRecordForUpdate(tx, id);
    if (agreement.kind !== "serviceAgreement") fail("Agreement not found.", 404);
    party(agreement, actor);
    const data = agreement.data;
    let status = agreement.status;
    let nextData: Record<string, unknown> = { ...data };
    const now = new Date().toISOString();
    if (v.action === "deliver") {
      requireRole(data, actor, "seller");
      if (status !== "active") fail("Deliveries require an active agreement.", 409);
      const m = getMilestone(data, v.milestoneId);
      if (!["pending", "revision_requested"].includes(m.status)) fail("This milestone is not accepting a delivery.", 409);
      clean(v.deliveryText);
      const changed = { ...m, status: "delivered", deliveryText: v.deliveryText, deliveredAt: now };
      nextData.milestones = replaceMilestone(data, changed);
      nextData.events = pushedEvent(data, actor, "milestone-delivered");
    } else if (v.action === "accept_milestone" || v.action === "request_revision") {
      requireRole(data, actor, "buyer");
      if (status !== "active") fail("Milestone decisions require an active agreement.", 409);
      const m = getMilestone(data, v.milestoneId);
      if (m.status !== "delivered") fail("Only a delivered milestone can be accepted or returned for revision.", 409);
      if (v.action === "request_revision") {
        if (m.revisionCount >= 3) fail("This milestone reached its three-revision limit.", 409);
        clean(v.reason);
        const changed = { ...m, status: "revision_requested", revisionCount: m.revisionCount + 1,
          revisionNotes: [...m.revisionNotes, { actor, text: v.reason, at: now }] };
        nextData.milestones = replaceMilestone(data, changed);
        nextData.events = pushedEvent(data, actor, "revision-requested");
      } else {
        nextData.milestones = replaceMilestone(data, { ...m, status: "accepted" });
        const remaining = (nextData.milestones as Milestone[]).some(x => x.status !== "accepted");
        if (!remaining) status = "completed";
        nextData.events = pushedEvent(data, actor, "milestone-accepted");
      }
    } else if (v.action === "open_dispute") {
      if (status !== "active") fail("A dispute must be opened against an active agreement.", 409);
      const m = getMilestone(data, v.milestoneId);
      if (!["delivered", "pending", "revision_requested"].includes(m.status)) fail("This milestone can no longer be disputed.", 409);
      clean(v.reason);
      const dispute: Dispute = { id: randomUUID(), milestoneId: m.id, openedBy: actor,
        reason: v.reason, openedAt: now, status: "open", evidence: [] };
      nextData.disputes = [...list(data.disputes), dispute];
      nextData.milestones = replaceMilestone(data, { ...m, status: "disputed" });
      nextData.events = pushedEvent(data, actor, "dispute-opened");
      status = "disputed";
    } else if (v.action === "add_dispute_evidence") {
      if (status !== "disputed") fail("There is no open dispute on this agreement.", 409);
      clean(v.reason);
      const disputes = list(data.disputes) as unknown as Dispute[];
      const d = disputes.find(x => x.id === v.disputeId && x.status === "open");
      if (!d) fail("Open dispute not found.", 404);
      if (d.evidence.length >= 20) fail("This dispute reached its 20-evidence-item limit.", 429);
      nextData.disputes = disputes.map(x => x.id === d.id ? {
        ...x, evidence: [...x.evidence, { actor, text: v.reason, at: now }],
      } : x);
      nextData.events = pushedEvent(data, actor, "dispute-evidence-added");
    } else if (v.action === "propose_resolution") {
      if (status !== "disputed") fail("There is no open dispute to resolve.", 409);
      const disputes = list(data.disputes) as unknown as Dispute[];
      const d = disputes.find(x => x.id === v.disputeId && x.status === "open");
      if (!d) fail("Open dispute not found.", 404);
      if (d.resolutionProposal?.actor === actor) fail("The other party must respond or counter-propose.", 403);
      if ((d.resolutionProposal?.counters ?? 0) >= 3) fail("This dispute reached its three-counterproposal limit.", 409);
      clean(v.reason);
      const proposal = { actor, outcome: v.outcome, reason: v.reason, at: now,
        counters: (d.resolutionProposal?.counters ?? 0) + (d.resolutionProposal ? 1 : 0) };
      nextData.disputes = disputes.map(x => x.id === d.id ? { ...x, resolutionProposal: proposal } : x);
      nextData.events = pushedEvent(data, actor, "resolution-proposed");
    } else if (v.action === "accept_resolution") {
      if (status !== "disputed") fail("There is no open dispute to resolve.", 409);
      const disputes = list(data.disputes) as unknown as Dispute[];
      const d = disputes.find(x => x.id === v.disputeId && x.status === "open");
      if (!d?.resolutionProposal) fail("No resolution proposal is awaiting consent.", 409);
      if (d.resolutionProposal.actor === actor) fail("The other party must consent to the proposed resolution.", 403);
      const outcome = d.resolutionProposal.outcome;
      let milestone = getMilestone(data, d.milestoneId);
      if (outcome === "accept_delivery") milestone = { ...milestone, status: "accepted" };
      else if (outcome === "revise") milestone = { ...milestone, status: "revision_requested",
        revisionCount: milestone.revisionCount + 1,
        revisionNotes: [...milestone.revisionNotes, { actor: d.resolutionProposal.actor, text: d.resolutionProposal.reason, at: d.resolutionProposal.at }] };
      const updatedDispute = { ...d, status: "resolved" as const, resolvedAt: now, resolvedBy: actor };
      nextData.disputes = disputes.map(x => x.id === d.id ? updatedDispute : x);
      nextData.milestones = replaceMilestone(data, milestone);
      nextData.events = pushedEvent(data, actor, "resolution-mutually-accepted");
      if (outcome === "cancel_agreement") status = "cancelled";
      else {
        status = (nextData.milestones as Milestone[]).every(m => m.status === "accepted") ? "completed" : "active";
      }
    }
    if (status === "completed") nextData.completedAt = now;
    if (status === "cancelled") nextData.cancelledAt = now;
    const result = await updateRecord(tx, agreement, { status, data: nextData });
    if (status === "completed" || status === "cancelled") {
      const serviceId = String(data.serviceId);
      await tx.update(records).set({ status }).where(and(eq(records.id, serviceId), eq(records.kind, "service")));
    }
    return serial(result);
  });
}

export async function reviewServiceAgreement(actor: string, id: string, input: unknown) {
  if (!actor) fail("Sign in to submit a review.", 401);
  const v = ReviewServiceAgreementBody.parse(input);
  clean(v.body);
  return withCommonsLock(async tx => {
    const agreement = await findRecordForUpdate(tx, id);
    if (agreement.kind !== "serviceAgreement" || agreement.status !== "completed" || !isParty(agreement, actor))
      fail("Only parties to completed work may submit a substantiated review.", 404);
    const reviewedActor = agreement.data.buyer === actor ? String(agreement.data.seller) : String(agreement.data.buyer);
    if (actor === reviewedActor) fail("You cannot review your own work.", 403);
    const previous = await tx.select({ id: records.id }).from(records).where(and(
      eq(records.kind, "serviceReview"),
      sql`${records.data}->>'agreementId' = ${id}`,
      eq(records.owner, actor),
    ));
    if (previous.length) fail("You have already reviewed this completed agreement.", 409);
    await assertRecordCapacity(tx, actor);
    const [review] = await tx.insert(records).values({
      id: randomUUID(), kind: "serviceReview", title: "Review of completed GitAI service",
      body: v.body, owner: actor, status: "pending", namespace: null,
      data: { parties: [actor, reviewedActor], agreementId: id, rating: v.rating,
        reviewer: actor, reviewedActor, visibility: "public",
        evidence: "GitAI agreement reached completed through recorded delivery and consent." },
    }).returning();
    return serial(review);
  });
}
