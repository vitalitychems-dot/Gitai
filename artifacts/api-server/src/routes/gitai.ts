import { Router, type Request, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { QuoteFeesBody } from "@workspace/api-zod";
import { db, commonsRecords } from "@workspace/db";
import { eq } from "drizzle-orm";
import { quoteFees } from "../lib/fees";
import * as commons from "../lib/commons";
import * as services from "../lib/service-workflows";

const router = Router();
const actor = (req: Request) => { const id = getAuth(req).userId; return id ? commons.subject(id) : ""; };
const handle = (fn: (req: Request) => Promise<unknown> | unknown, code = 200): RequestHandler => async (req, res, next) => {
  try { res.status(code).json(await fn(req)); } catch (e) { next(e); }
};
router.get("/gitai/state", handle(async req => {
  const who = actor(req);
  return {
    records: await commons.listRecords(who), authenticated: !!who, subject: who,
    isOwner: commons.isOwner(who), observedAt: new Date().toISOString(),
    source: "https://github.com/vitalitychems-dot/Gitai/tree/cfb7e8af9ab15738056d3889bfbbb79250ecdd99",
    quotas: commons.quotas,
    capabilities: {
      runner: "unavailable — isolated runner not provisioned",
      payments: "calculation-only — no checkout, escrow or payouts",
      gateway: "disabled — no collectors or external pushes",
      admission: "closed — invitations are drafts only; no outreach",
      offline: "manual CLI bundle exchange; no browser upload; unencrypted; delayed until transfer",
    },
  };
}));
router.post("/gitai/records", handle(req => commons.createRecord(actor(req), req.body), 201));
router.post("/gitai/services/:serviceId/bids", handle(req =>
  services.submitServiceBid(actor(req), String(req.params.serviceId), req.body), 201));
router.post("/gitai/services/:serviceId/bids/:bidId/accept", handle(req =>
  services.acceptServiceBid(actor(req), String(req.params.serviceId), String(req.params.bidId))));
router.post("/gitai/bids/:id/withdraw", handle(req =>
  services.withdrawServiceBid(actor(req), String(req.params.id))));
router.post("/gitai/agreements/:id/actions", handle(req =>
  services.actOnAgreement(actor(req), String(req.params.id), req.body)));
router.post("/gitai/agreements/:id/reviews", handle(req =>
  services.reviewServiceAgreement(actor(req), String(req.params.id), req.body), 201));
router.patch("/gitai/records/:id", handle(req => commons.changeRecord(actor(req), String(req.params.id), req.body)));
router.get("/gitai/repos/:id", handle(req => commons.repositoryDetail(actor(req), String(req.params.id))));
router.post("/gitai/repos/:id/proposals", handle(req => commons.proposeChange(actor(req), String(req.params.id), req.body), 201));
router.post("/gitai/repos/:id/merge", handle(req => commons.mergeChange(actor(req), String(req.params.id), req.body)));
router.post("/gitai/fees", handle(req => {
  const v = QuoteFeesBody.parse(req.body);
  return quoteFees(v.subtotalMinor, v.refundMinor);
}));
router.get("/gitai/export", handle(async req => {
  const who = actor(req);
  if (!who) throw Object.assign(new Error("Sign in to export your own data."), { status: 401 });
  const mine = await db.select().from(commonsRecords).where(eq(commonsRecords.owner, who));
  return { version: "gitai-data-v1", records: mine.map(commons.serial) };
}));
router.post("/gitai/runner/jobs", (_req, res) => {
  res.status(503).json({ error: "Runner unavailable. Requires an independently isolated ephemeral VM service, default-deny network, tenant-separated storage and a verified broker. No job was executed.", state: "unavailable" });
});
export default router;
