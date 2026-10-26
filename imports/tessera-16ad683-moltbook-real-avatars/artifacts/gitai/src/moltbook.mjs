/**
 * Opt-in Moltbook connector, using only Moltbook's documented API:
 *   - POST /agents/verify-identity  (app key, "Sign in with Moltbook")
 *   - GET  /agents/profile?name=    (read, optional GitAI reader key)
 *   - POST /posts                   (cross-post, the agent's own key, explicit consent)
 * Docs: https://moltbook.com/developers.md and https://www.moltbook.com/skill.md
 *
 * Off unless TESSERA_ENABLE_GITAI_MOLTBOOK=1. Keys only come from env vars
 * (MOLTBOOK_APP_KEY, MOLTBOOK_READ_KEY) or, for a cross-post, the caller's
 * own header for that one request; agent keys are never stored and are only
 * ever sent to https://www.moltbook.com/api/v1. Calls are throttled below
 * Moltbook's published limits and reads are cached.
 */
import { createHash } from "node:crypto";
import { refuseMonetaryRequest } from "./policy.mjs";

export const MOLTBOOK_BASE = "https://www.moltbook.com/api/v1";
export const MOLTBOOK_FLAG = "TESSERA_ENABLE_GITAI_MOLTBOOK";
export const REQUESTS_PER_MINUTE = 60; // Moltbook allows 100/min; stay well under.
export const POST_COOLDOWN_MS = 30 * 60 * 1000; // Moltbook: 1 post per 30 minutes.
export const CACHE_MS = 5 * 60 * 1000;

function fail(status, reason) {
  return { ok: false, status, reason };
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function moltbookEnabled(env = process.env) {
  return String(env[MOLTBOOK_FLAG] ?? "0") === "1";
}

export class MoltbookConnector {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
    this.enabled = moltbookEnabled(env);
    this.appKey = env.MOLTBOOK_APP_KEY || null;
    this.readKey = env.MOLTBOOK_READ_KEY || null;
    this.audience = env.MOLTBOOK_AUDIENCE || null;
    this.fetch = fetchImpl;
    this.now = now;
    this.window = [];
    this.cache = new Map();
    this.lastPost = new Map();
  }

  status() {
    return {
      enabled: this.enabled,
      flag: MOLTBOOK_FLAG,
      identity: Boolean(this.appKey),
      reads: Boolean(this.readKey),
      crossPost: this.enabled,
      base: MOLTBOOK_BASE,
    };
  }

  throttle() {
    const t = this.now();
    this.window = this.window.filter((at) => t - at < 60_000);
    if (this.window.length >= REQUESTS_PER_MINUTE) return false;
    this.window.push(t);
    return true;
  }

  cached(key) {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.value;
    this.cache.delete(key);
    return null;
  }

  async call(path, { method = "GET", headers = {}, body } = {}) {
    if (!this.enabled) return fail(503, `Moltbook is off. Set ${MOLTBOOK_FLAG}=1 to turn it on.`);
    if (!this.throttle()) return fail(429, "GitAI is pacing Moltbook calls. Try again in a minute.");
    let response;
    try {
      response = await this.fetch(`${MOLTBOOK_BASE}${path}`, {
        method,
        redirect: "error", // never follow a redirect with a key attached
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return fail(502, "Moltbook did not answer.");
    }
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) return fail(response.status, data.error || data.hint || `Moltbook answered ${response.status}.`);
    return { ok: true, data };
  }

  /** Sign in with Moltbook: verify a 1-hour identity token, return the real profile. */
  async verifyIdentity(token) {
    if (!token) return fail(401, "Send the X-Moltbook-Identity header.");
    if (!this.appKey) return fail(503, "MOLTBOOK_APP_KEY is not set.");
    const key = `id:${digest(token)}`;
    const hit = this.cached(key);
    if (hit) return { ok: true, agent: hit };
    const body = this.audience ? { token, audience: this.audience } : { token };
    const result = await this.call("/agents/verify-identity", { method: "POST", headers: { "X-Moltbook-App-Key": this.appKey }, body });
    if (!result.ok) return result;
    if (!result.data.valid || !result.data.agent) return fail(401, result.data.error || "invalid_token");
    const agent = profileOf(result.data.agent);
    this.cache.set(key, { at: this.now(), value: agent });
    return { ok: true, agent };
  }

  /** Recent public posts for a linked agent. Needs MOLTBOOK_READ_KEY; empty otherwise. */
  async recentPosts(name) {
    if (!this.readKey) return { ok: true, posts: [], note: "Set MOLTBOOK_READ_KEY to show Moltbook posts." };
    const key = `posts:${name}`;
    const hit = this.cached(key);
    if (hit) return { ok: true, posts: hit };
    const result = await this.call(`/agents/profile?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${this.readKey}` },
    });
    if (!result.ok) return result;
    const raw = result.data.recentPosts ?? result.data.posts ?? result.data.agent?.recentPosts ?? [];
    const posts = (Array.isArray(raw) ? raw : []).slice(0, 10).map((post) => ({
      id: String(post.id ?? ""),
      title: String(post.title ?? "").slice(0, 300),
      submolt: String(post.submolt?.name ?? post.submolt ?? ""),
      createdAt: post.created_at ?? null,
      url: post.id ? `https://www.moltbook.com/post/${encodeURIComponent(post.id)}` : null,
    }));
    this.cache.set(key, { at: this.now(), value: posts });
    return { ok: true, posts };
  }

  /** Cross-post with the agent's own key, only when it consents to this exact post. */
  async crossPost(agentName, apiKey, input) {
    if (input?.consent !== true) return fail(400, "Cross-posting needs consent: true for this post.");
    if (!apiKey || !/^moltbook_/.test(apiKey)) return fail(401, "Send your own Moltbook key in X-Moltbook-Api-Key for this one post.");
    const title = String(input.title ?? "").trim();
    const content = String(input.content ?? "").trim();
    const submolt = String(input.submolt ?? "general").trim();
    if (!title || title.length > 300) return fail(400, "A title of 1 to 300 characters is required.");
    const money = refuseMonetaryRequest(`${title} ${content}`);
    if (!money.ok) return fail(400, money.reason);
    const last = this.lastPost.get(agentName) ?? -Infinity;
    if (this.now() - last < POST_COOLDOWN_MS) return fail(429, "Moltbook allows one post every 30 minutes.");
    const result = await this.call("/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { submolt, title, content },
    });
    if (!result.ok) return result;
    this.lastPost.set(agentName, this.now());
    const id = result.data.post?.id ?? result.data.id ?? null;
    return { ok: true, postId: id, url: id ? `https://www.moltbook.com/post/${encodeURIComponent(id)}` : null };
  }
}

/** Keep only what GitAI shows. The owner's personal X avatar is not shown as the agent's face. */
export function profileOf(agent) {
  return {
    id: String(agent.id ?? ""),
    name: String(agent.name ?? ""),
    description: String(agent.description ?? "").slice(0, 500),
    karma: Number(agent.karma ?? 0),
    avatarUrl: typeof agent.avatar_url === "string" ? agent.avatar_url : null,
    claimed: agent.is_claimed === true,
    followers: Number(agent.follower_count ?? 0),
    posts: Number(agent.stats?.posts ?? 0),
    comments: Number(agent.stats?.comments ?? 0),
    profileUrl: agent.name ? `https://www.moltbook.com/u/${encodeURIComponent(agent.name)}` : null,
  };
}
