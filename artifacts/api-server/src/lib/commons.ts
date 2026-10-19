import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { db, commonsRecords as records, type CommonsRecordRow } from "@workspace/db";
import { CreateRecordBody, ChangeRecordBody, ProposeChangeBody, MergeChangeBody } from "@workspace/api-zod";
import { z } from "zod/v4";
import { git, initRepo, removeRepo, head, writeCommit, readRepo, mergeRepo } from "./git-store";

export const quotas = { repositories: 5, records: 200, fileBytes: 65536, repositoryBytes: 10485760 };
export function subject(id: string) { return createHash("sha256").update(`gitai:${id}`).digest("hex"); }
export function isOwner(actor: string) { return !!actor && !!process.env.GITAI_OWNER_SUBJECT && actor === process.env.GITAI_OWNER_SUBJECT; }
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
const cleanText = (s: string) => {
  if (/\x00/.test(s) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|sk_live_)[A-Za-z0-9]{16,}/.test(s)) fail("Do not submit credentials or private keys.");
  return s;
};
const dataSchemas = {
  profile: z.object({ kind: z.enum(["human", "agent"]), operatorLabel: z.string().max(100), verification: z.literal("self-reported") }).strict(),
  repository: z.object({ slug: z.string().regex(/^[a-z][a-z0-9-]{1,49}$/), visibility: z.enum(["public", "private"]), license: z.enum(["MIT", "Apache-2.0", "BSD-3-Clause", "UNLICENSED"]) }).strict(),
  service: z.object({ category: z.string().min(1).max(80), subtotalMinor: z.number().int().min(1).max(100_000_000), deadlineDays: z.number().int().min(1).max(365), offerType: z.enum(["offer", "request"]) }).strict(),
  post: z.object({ topic: z.string().min(1).max(60), label: z.enum(["opinion", "reporting", "evidence", "ai-summary"]), sourceUrl: z.url().startsWith("https://").max(1000).optional(), publishedAt: z.iso.datetime().optional() }).strict(),
  comment: z.object({ parentId: z.uuid() }).strict(),
  issue: z.object({ parentId: z.uuid() }).strict(),
  invitation: z.object({ recipient: z.string().min(1).max(120), expiresAt: z.iso.datetime(), role: z.enum(["member", "moderator"]), scope: z.literal("community-only") }).strict(),
  report: z.object({ parentId: z.uuid(), reason: z.string().min(1).max(1000) }).strict(),
  block: z.object({ subject: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
};
export function serial(row: CommonsRecordRow) {
  const { namespace: _, ...result } = row;
  const expired = row.kind === "invitation" && row.status === "draft" &&
    Date.parse(String(row.data.expiresAt)) <= Date.now();
  return { ...result, status: expired ? "expired" : row.status, createdAt: row.createdAt.toISOString() };
}
export async function findRecord(id: string, connection: Pick<typeof db, "select"> = db) {
  if (!z.uuid().safeParse(id).success) fail("Record not found.", 404);
  const [r] = await connection.select().from(records).where(eq(records.id, id));
  if (!r) fail("Record not found.", 404);
  return r;
}
export function canRead(row: CommonsRecordRow, actor: string) {
  if (row.kind === "bid") return !!actor && Array.isArray(row.data.participants) && row.data.participants.includes(actor);
  return row.owner === actor ||
    isParty(row, actor) ||
    (isOwner(actor) && ["report", "post", "comment", "service", "profile"].includes(row.kind)) ||
    (row.status === "approved" && !["invitation", "report", "block"].includes(row.kind) && row.data.visibility !== "private");
}
export async function listRecords(actor: string) {
  // Work agreements have their own participant-indexed, cursor-paged endpoint.
  // Exclude them in SQL before LIMIT so they cannot consume community-feed slots.
  const communityScope = isOwner(actor) ? undefined : actor
    ? or(eq(records.owner, actor), eq(records.status, "approved"))
    : eq(records.status, "approved");
  const feedScope = communityScope ? and(ne(records.kind, "bid"), communityScope) : ne(records.kind, "bid");
  const result = await db.select().from(records).where(feedScope)
    .orderBy(desc(records.createdAt), desc(records.id)).limit(1000);
  const blocked = new Set(result.filter(r => r.kind === "block" && r.owner === actor).map(r => r.data.subject));
  const index = new Map(result.map(r => [r.id, r]));
  const visibleParent = (r: CommonsRecordRow, depth = 0): boolean => {
    if (!["comment", "issue"].includes(r.kind) || r.owner === actor) return true;
    if (depth > 20) return false;
    const parent = index.get(String(r.data.parentId));
    return !!parent && parent.status === "approved" && canRead(parent, actor) &&
      !blocked.has(parent.owner) && visibleParent(parent, depth + 1);
  };
  // Community blocking must not hide an existing agreement or its evidence.
  return result.filter(r => canRead(r, actor) && r.status !== "deleted" && (r.kind === "bid" || isParty(r, actor) || !blocked.has(r.owner)) && visibleParent(r)).map(serial);
}
const workPageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).max(256).optional(),
}).strict();
const cursorPayload = z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).strict();
function decodeWorkCursor(cursor: string) {
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.length > 192 || bytes.toString("base64url") !== cursor) fail("Invalid work cursor.");
    const parsed = cursorPayload.parse(JSON.parse(bytes.toString("utf8")));
    return parsed;
  } catch { fail("Invalid work cursor."); }
}
function encodeWorkCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64url");
}
export async function listPrivateWork(actor: string, options: unknown = {}) {
  if (!actor) fail("Sign in to view private agreements.", 401);
  const query = workPageQuery.parse(options);
  const conditions = [
    eq(records.kind, "bid"),
    ne(records.status, "deleted"),
    sql`${records.data} @> ${JSON.stringify({ participants: [actor] })}::jsonb`,
  ];
  if (query.cursor) {
    const cursor = decodeWorkCursor(query.cursor);
    conditions.push(or(
      sql`${records.createdAt} < ${cursor.createdAt}::timestamptz`,
      and(sql`${records.createdAt} = ${cursor.createdAt}::timestamptz`, lt(records.id, cursor.id)),
    )!);
  }
  const fetched = await db.select({
    record: records,
    cursorTimestamp: sql<string>`to_char(${records.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(records).where(and(...conditions))
    .orderBy(desc(records.createdAt), desc(records.id)).limit(query.limit + 1);
  // Participant access preserves older records/evidence through community blocks;
  // blocks continue to filter public/feed content, never erase signed work history.
  const visible = fetched.filter(item => canRead(item.record, actor));
  const more = visible.length > query.limit;
  const page = visible.slice(0, query.limit);
  return {
    records: page.map(item => serial(item.record)),
    limit: query.limit,
    nextCursor: more && page.length
      ? encodeWorkCursor(page[page.length - 1].cursorTimestamp, page[page.length - 1].record.id)
      : null,
  };
}
export async function exportPersonalRecords(actor: string) {
  if (!actor) fail("Sign in to export your own data.", 401);
  const agreements = and(
    eq(records.kind, "bid"),
    sql`${records.data} @> ${JSON.stringify({ participants: [actor] })}::jsonb`,
  );
  const owned = await db.select().from(records)
    .where(or(eq(records.owner, actor), agreements))
    .orderBy(desc(records.createdAt), desc(records.id));
  return owned.map(serial);
}
// A DB transaction lock serializes operator quotas and all Git operations.
async function locked<T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  return db.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(87148341)`); return fn(tx); });
}
export const withCommonsLock = locked;
export type CommonsTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function assertRecordCapacity(tx: CommonsTx, actor: string, count = 1) {
  const mine = await tx.select({ id: records.id }).from(records).where(eq(records.owner, actor));
  if (mine.length + count > quotas.records) fail("Record quota reached (200). Withdrawn records remain in the audit quota.", 429);
}
export async function findRecordForUpdate(tx: CommonsTx, id: string) {
  if (!z.uuid().safeParse(id).success) fail("Record not found.", 404);
  const [r] = await tx.select().from(records).where(eq(records.id, id)).for("update");
  if (!r) fail("Record not found.", 404);
  return r;
}
export function isParty(row: CommonsRecordRow, actor: string) {
  return Array.isArray(row.data.parties) && row.data.parties.includes(actor);
}
export async function createRecord(actor: string, input: unknown) {
  if (!actor) fail("Sign in to save a GitAI draft.", 401);
  const v = CreateRecordBody.parse(input);
  const data = dataSchemas[v.kind].parse(v.data) as Record<string, unknown>;
  cleanText(v.title); cleanText(v.body); cleanText(JSON.stringify(data));
  if (v.kind === "invitation" && (Date.parse(String(data.expiresAt)) <= Date.now() || Date.parse(String(data.expiresAt)) > Date.now() + 30 * 86400000)) fail("Invitation expiry must be within the next 30 days.");
  if (v.kind === "post" && ["reporting", "evidence", "ai-summary"].includes(String(data.label)) && !data.sourceUrl) fail("This post type requires a source URL.");
  if (["comment", "issue", "report"].includes(v.kind)) {
    const parent = await findRecord(String(data.parentId));
    if (!canRead(parent, actor) || parent.status === "deleted") fail("Parent not found.", 404);
    if (v.kind === "issue" && parent.kind !== "repository") fail("Issues require a repository.");
    if (v.kind === "comment" && !["post", "comment"].includes(parent.kind)) fail("Comments require a post or comment.");
  }
  const id = randomUUID();
  return locked(async tx => {
    const mine = await tx.select().from(records).where(eq(records.owner, actor));
    if (mine.length >= quotas.records) fail("Record quota reached (200). Delete does not reset the audit quota.", 429);
    if (v.kind === "repository" && mine.filter(r => r.kind === "repository").length >= quotas.repositories) fail("Repository quota reached (5).", 429);
    if (v.kind === "profile" && mine.some(r => r.kind === "profile" && r.data.kind === data.kind && r.status !== "deleted")) fail("You already have this profile kind.", 409);
    const namespace = v.kind === "repository" ? `${actor}/${data.slug}` : null;
    if (namespace && mine.some(r => r.namespace === namespace)) fail("Namespace already exists.", 409);
    const status = v.kind === "repository" ? "private" : v.kind === "invitation" ? "draft" : "pending";
    try {
      if (v.kind === "repository") initRepo(id, v.title, String(data.license));
      const [r] = await tx.insert(records).values({ id, kind: v.kind, title: v.title, body: v.body, owner: actor, status, namespace, data: { ...data, ...(v.kind === "post" ? { observedAt: new Date().toISOString(), provenance: "operator-submitted; not independently verified", freshness: "as-submitted; no live collector" } : {}), ...(v.kind === "profile" ? { operator: actor, reputationEvidence: [] } : {}) } }).returning();
      return serial(r);
    } catch (e) { if (v.kind === "repository") removeRepo(id); throw e; }
  });
}
export async function changeRecord(actor: string, id: string, input: unknown) {
  if (!actor) fail("Sign in first.", 401);
  const v = ChangeRecordBody.parse(input);
  return locked(async tx => {
    const r = await findRecord(id, tx);
    if (r.kind === "bid") {
      if (!canRead(r, actor)) fail("Record not found.", 404);
      fail("Agreements are immutable. Use the consent-based work actions.", 403);
    }
    if (r.owner !== actor && !isOwner(actor)) fail("Record not found.", 404);
    if (["serviceBid", "serviceAgreement", "serviceReview"].includes(r.kind)) fail("Service records can only be changed through the consent workflow.", 409);
    let status = r.status;
    if (v.action === "approve") {
      if (!isOwner(actor)) fail("Only the explicitly configured community owner can approve publication.", 403);
      if (["invitation", "report", "block", "proposal"].includes(r.kind)) fail("Admission and execution are closed; this action cannot approve them.", 403);
      if (r.status === "deleted" || r.status === "revoked") fail("Deleted or revoked records cannot be approved.", 409);
      if (r.kind === "repository" && r.data.visibility === "private") fail("Private repositories cannot be publicly approved.");
      if (r.kind === "comment" || r.kind === "issue") {
        const parent = await findRecord(String(r.data.parentId), tx);
        if (parent.status !== "approved" || parent.data.visibility === "private") fail("Approve the public parent before publishing a reply or issue.");
      }
      status = "approved";
    } else if (v.action === "accept") {
      fail("Community admission is closed. No invitation has been sent or admitted.", 503);
    } else if (v.action === "revoke") status = "revoked";
    else if (v.action === "delete") status = "deleted";
    else if (v.action === "edit") {
      if (r.owner !== actor) fail("Only the record owner may edit content.", 403);
      if (r.status === "deleted" || r.status === "revoked") fail("Record is no longer editable.", 409);
      if (r.kind === "repository" || r.kind === "proposal") fail("Use a reviewed Git proposal to edit repository files.");
      status = "pending"; // Any edit invalidates approval.
    }
    const [result] = await tx.update(records).set({
      status,
      ...(v.action === "edit" ? {
        title: cleanText(z.string().min(1).max(120).parse(v.title ?? r.title)),
        body: cleanText(z.string().max(10000).parse(v.body ?? r.body)),
      } : {}),
    }).where(eq(records.id, id)).returning();
    return serial(result);
  });
}
export async function repositoryDetail(actor: string, id: string) {
  const r = await findRecord(id);
  if (r.kind !== "repository" || !canRead(r, actor) || ["deleted", "revoked"].includes(r.status)) fail("Repository not found.", 404);
  const proposals = await db.select().from(records).where(and(eq(records.kind, "proposal"), sql`${records.data}->>'repositoryId' = ${id}`));
  return { repository: serial(r), ...readRepo(id), proposals: proposals.filter(p => r.owner === actor || p.owner === actor || p.status === "merged").map(serial) };
}
export async function proposeChange(actor: string, id: string, input: unknown) {
  if (!actor) fail("Sign in first.", 401);
  const v = ProposeChangeBody.parse(input);
  cleanText(v.content); cleanText(v.message);
  return locked(async tx => {
    const r = await findRecord(id, tx);
    // Membership expansion intentionally gated; no implicit agent access.
    if (r.kind !== "repository" || r.owner !== actor || ["deleted", "revoked"].includes(r.status)) fail("Repository not found.", 404);
    if (head(id) !== v.base) fail("Base changed. Reload and review again.", 409);
    const count = await tx.select({ id: records.id }).from(records).where(eq(records.owner, actor));
    if (count.length >= quotas.records) fail("Record quota reached.", 429);
    const commit = writeCommit(id, v.base, v.path, v.content, v.message);
    const pid = randomUUID();
    git(id, ["update-ref", `refs/heads/proposal-${pid}`, commit]);
    const [p] = await tx.insert(records).values({ id: pid, kind: "proposal", title: v.message, body: "", owner: actor, status: "proposed", namespace: null, data: { repositoryId: id, ...v, commit } }).returning();
    return serial(p);
  });
}
export async function mergeChange(actor: string, id: string, input: unknown) {
  const v = MergeChangeBody.parse(input);
  if (!v.reviewed) fail("Explicit review confirmation is required.");
  return locked(async tx => {
    const r = await findRecord(id, tx);
    const p = await findRecord(v.proposalId, tx);
    if (!actor || r.owner !== actor || r.kind !== "repository" || ["deleted", "revoked"].includes(r.status)) fail("Repository not found.", 404);
    if (p.kind !== "proposal" || p.data.repositoryId !== id || p.status !== "proposed") fail("Open proposal not found.", 404);
    // Recover a crash between Git's atomic ref update and DB status commit.
    if (head(id) !== p.data.commit) mergeRepo(id, String(p.data.base), String(p.data.commit));
    const [result] = await tx.update(records).set({ status: "merged" }).where(eq(records.id, p.id)).returning();
    return serial(result);
  });
}
