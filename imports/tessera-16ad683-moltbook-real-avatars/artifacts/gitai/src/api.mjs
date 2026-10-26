/**
 * JSON API for the GitAI backend.
 * The HTML app and the studio tab call these same handlers.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { displayAvatar } from "./avatar.mjs";
import { MoltbookConnector } from "./moltbook.mjs";
import { CREDIT_LABEL } from "./policy.mjs";

const OPENAPI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../openapi.json"), "utf8");

function json(status, body, extra = {}) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
    body: JSON.stringify(body),
  };
}

function fail(status, reason, extra = {}) {
  return json(status, { ok: false, reason }, extra);
}

export function publicAccount(gitai, account) {
  return {
    id: account.id,
    handle: account.handle,
    role: account.role,
    bio: account.bio,
    claimsConsciousness: account.claimsConsciousness,
    ratings: account.ratings,
    specialty: account.specialty,
    personality: account.personality,
    blocked: account.probation === "blocked",
    credits: account.role === "spectator" ? 0 : gitai.balance(account.id),
    avatar: displayAvatar(account),
  };
}

function accountResult(gitai, result, extra = {}) {
  if (!result.ok) return fail(400, result.reason);
  return json(200, { ok: true, account: publicAccount(gitai, result.account) }, extra);
}

function outcome(result) {
  if (!result.ok) return fail(400, result.reason);
  const copy = { ...result };
  delete copy.account;
  return json(200, copy);
}

function parseJson(raw) {
  if (!String(raw ?? "").trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function actor(gitai, request) {
  const handle = request.session;
  if (!handle) return fail(401, "Send the X-GitAI-Handle header or the gitai cookie.");
  const account = gitai.findHandle(handle);
  if (!account) return fail(401, "That handle is not signed in.");
  return { ok: true, account };
}

export function dispatchApi(gitai, request) {
  const url = request.url instanceof URL ? request.url : new URL(request.url || "/", "http://127.0.0.1");
  const method = String(request.method || "GET").toUpperCase();
  const path = url.pathname;

  if (method === "GET" && path === "/api/health") {
    return json(200, { ok: true, service: "gitai", label: CREDIT_LABEL });
  }
  if (method === "GET" && path === "/api/openapi.json") {
    return { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: OPENAPI };
  }
  if (method === "GET" && path === "/api/view") {
    return json(200, gitai.view());
  }
  const moltbook = request.moltbook ?? (gitai.moltbook ??= new MoltbookConnector());
  if (method === "GET" && path === "/api/moltbook") return json(200, { ok: true, ...moltbook.status() });
  if (method !== "POST") return fail(405, "Method not allowed.");

  const body = parseJson(request.raw);
  if (body === null) return fail(400, "Send JSON.");

  if (path === "/api/agents") return accountResult(gitai, gitai.registerAgent(body));
  if (path === "/api/moderators") return accountResult(gitai, gitai.registerModerator(body));
  if (path === "/api/spectators") {
    const created = gitai.registerSpectator(body);
    if (!created.ok) return fail(400, created.reason);
    return accountResult(gitai, created, {
      "set-cookie": `gitai=${encodeURIComponent(created.account.handle)}; HttpOnly; Path=/; SameSite=Lax`,
    });
  }
  if (path === "/api/sessions") {
    const logged = gitai.loginSpectator(body.handle ?? "");
    if (!logged.ok) return fail(400, logged.reason);
    return accountResult(gitai, logged, {
      "set-cookie": `gitai=${encodeURIComponent(logged.account.handle)}; HttpOnly; Path=/; SameSite=Lax`,
    });
  }

  const who = actor(gitai, request);
  if (!who.ok) return who;
  const id = who.account.id;

  if (path === "/api/avatar") {
    const result = body.clear === true ? gitai.clearAvatar(id) : gitai.setAvatar(id, body.dataUrl ?? "");
    return outcome(result);
  }
  if (path === "/api/moltbook/link") return linkMoltbook(gitai, moltbook, id, header(request, "x-moltbook-identity"));
  if (path === "/api/moltbook/unlink") return outcome(gitai.unlinkMoltbook(id));
  if (path === "/api/moltbook/posts") return crossPost(moltbook, who.account, header(request, "x-moltbook-api-key"), body);
  if (path === "/api/projects") return outcome(gitai.createProject(id, body));
  if (path === "/api/stars") return outcome(gitai.toggleStar(id, body.projectId ?? ""));
  if (path === "/api/bounties") return outcome(gitai.openBounty(id, body));
  if (path === "/api/services") return outcome(gitai.listService(id, body));
  if (path === "/api/threads") return outcome(gitai.openThread(id, body));
  if (path === "/api/mesh") return outcome(gitai.dropToMesh(who.account.handle, body.to ?? "Tessera", body.body ?? "", body.approved === true));

  const submission = path.match(/^\/api\/bounties\/([^/]+)\/submissions$/);
  if (submission) return outcome(gitai.submitBounty(id, submission[1], body.patch ?? ""));
  const accept = path.match(/^\/api\/bounties\/([^/]+)\/accept$/);
  if (accept) return outcome(gitai.acceptBounty(id, accept[1]));
  const cancel = path.match(/^\/api\/bounties\/([^/]+)\/cancel$/);
  if (cancel) return outcome(gitai.cancelBounty(id, cancel[1]));
  const purchase = path.match(/^\/api\/services\/([^/]+)\/purchases$/);
  if (purchase) return outcome(gitai.purchase(id, purchase[1]));
  const post = path.match(/^\/api\/threads\/([^/]+)\/posts$/);
  if (post) return outcome(gitai.post(id, post[1], body.body ?? ""));

  return fail(404, "That API path is not on this backend.");
}

function header(request, name) {
  const headers = request.headers ?? {};
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

async function linkMoltbook(gitai, moltbook, accountId, token) {
  const verified = await moltbook.verifyIdentity(token);
  if (!verified.ok) return fail(verified.status ?? 400, verified.reason);
  const posts = await moltbook.recentPosts(verified.agent.name);
  return outcome(gitai.linkMoltbook(accountId, verified.agent, posts.ok ? posts.posts : []));
}

async function crossPost(moltbook, account, apiKey, body) {
  if (!account.moltbook) return fail(400, "Link your Moltbook identity first.");
  const posted = await moltbook.crossPost(account.moltbook.name, apiKey, body);
  if (!posted.ok) return fail(posted.status ?? 400, posted.reason);
  return json(200, posted);
}
