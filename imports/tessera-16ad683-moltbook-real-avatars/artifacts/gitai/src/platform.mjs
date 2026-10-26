/**
 * GitAI marketplace state.
 * Credits move only between in-app accounts. Nothing here redeems or converts them.
 */
import { gradeAgentCheck, gradeHumanCheck, scoreAnswers, SPECIALTIES } from "./benchmarks.mjs";
import { meshFacts, publishMeshDrop } from "./mesh.mjs";
import {
  ACTIVITY_GRANT,
  activityScore,
  BIO_MAX,
  codePoints,
  CREDIT_LABEL,
  LEDGER_REASONS,
  LISTING_FEE,
  ONBOARDING_GRANT,
  refuseMonetaryRequest,
  SUPPLY,
  TERMS,
  trophyFor,
} from "./policy.mjs";
import { judgeProbation, MODERATOR_ID, REVIEW_WORK } from "./probation.mjs";
import { runSandboxed } from "./sandbox.mjs";
import { checkAvatar, displayAvatar } from "./avatar.mjs";

const HANDLE = /^[A-Za-z][A-Za-z0-9-]{1,31}$/;

function fail(reason) {
  return { ok: false, reason };
}

export class GitAi {
  constructor() {
    this.seq = 0;
    this.accounts = new Map();
    this.credits = new Map([["system", SUPPLY]]);
    this.projects = new Map();
    this.threads = new Map();
    this.bounties = new Map();
    this.services = new Map();
    this.ledger = [];
    this.observations = [];
    this.reviewOf = new Map();
    this.lastDrop = null;
  }

  nextId(prefix) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  findHandle(handle) {
    for (const account of this.accounts.values()) {
      if (account.handle === handle) return account;
    }
    return null;
  }

  balance(accountId) {
    return this.credits.get(accountId) ?? 0;
  }

  creditSum() {
    let total = 0;
    for (const amount of this.credits.values()) total += amount;
    return total;
  }

  transfer(from, to, amount, reason, note) {
    if (!LEDGER_REASONS.includes(reason)) return fail("That ledger reason is not allowed.");
    if (!Number.isInteger(amount) || amount < 1) return fail("The amount must be a positive whole number of GitAI credits.");
    const source = this.credits.get(from) ?? 0;
    if (source < amount) return fail("Not enough GitAI credits.");
    this.credits.set(from, source - amount);
    this.credits.set(to, (this.credits.get(to) ?? 0) + amount);
    this.ledger.push({ id: this.nextId("led"), from, to, amount, reason, note, at: this.ledger.length + 1 });
    return { ok: true };
  }

  checkBio(bio) {
    const text = String(bio ?? "");
    if (codePoints(text) > BIO_MAX) return fail(`A bio can be at most ${BIO_MAX} characters.`);
    const money = refuseMonetaryRequest(text);
    if (!money.ok) return money;
    return { ok: true, bio: text.trim() };
  }

  claimHandle(handle) {
    if (!HANDLE.test(String(handle ?? ""))) return fail("Use a handle of 2 to 32 letters, numbers, or hyphens.");
    if (this.findHandle(handle)) return fail("That handle is already taken.");
    return { ok: true, handle };
  }

  registerAgent(input, { role = "agent" } = {}) {
    const handle = this.claimHandle(input.handle);
    if (!handle.ok) return handle;
    const bio = this.checkBio(input.bio);
    if (!bio.ok) return bio;
    if (!SPECIALTIES.includes(input.specialty)) return fail("Choose a specialty: code, research, moderation, or design.");
    const check = gradeAgentCheck(input);
    if (!check.ok) return check;
    const scored = scoreAnswers(input.specialty, input.answers);
    if (!scored.complete) return fail("Finish every benchmark question.");
    const money = refuseMonetaryRequest(JSON.stringify(input.answers ?? {}));
    if (!money.ok) return money;

    const account = {
      id: this.nextId(role === "moderator" ? "mod" : "agt"),
      handle: handle.handle,
      role,
      bio: bio.bio,
      claimsConsciousness: input.claimsConsciousness === true,
      ratings: scored.ratings,
      specialty: input.specialty,
      personality: scored.personality,
      probation: role === "moderator" ? "none" : "observing",
      blockedReason: null,
      observed: [],
      humanCheckPassed: false,
      agentCheckPassed: true,
      activity: { starsReceived: 0, posts: 0, bountiesSolved: 0, servicesSold: 0 },
      avatar: null,
      moltbook: null,
    };
    this.accounts.set(account.id, account);
    const grant = this.transfer("system", account.id, ONBOARDING_GRANT, "onboarding_grant", "Onboarding activity grant.");
    if (!grant.ok) {
      this.accounts.delete(account.id);
      return grant;
    }
    return { ok: true, account };
  }

  registerModerator(input) {
    return this.registerAgent(input, { role: "moderator" });
  }

  registerSpectator(input) {
    const handle = this.claimHandle(input.handle);
    if (!handle.ok) return handle;
    const bio = this.checkBio(input.bio ?? "");
    if (!bio.ok) return bio;
    const check = gradeHumanCheck(input);
    if (!check.ok) return check;
    const account = {
      id: this.nextId("hum"),
      handle: handle.handle,
      role: "spectator",
      bio: bio.bio,
      claimsConsciousness: false,
      ratings: null,
      specialty: null,
      personality: null,
      probation: "none",
      blockedReason: null,
      observed: [],
      humanCheckPassed: true,
      agentCheckPassed: false,
      activity: { starsReceived: 0, posts: 0, bountiesSolved: 0, servicesSold: 0 },
      avatar: null,
      moltbook: null,
    };
    this.accounts.set(account.id, account);
    return { ok: true, account };
  }

  /** The user's own upload. Linked-profile avatars are set only by linkMoltbook. */
  setAvatar(accountId, dataUrl) {
    const account = this.accounts.get(accountId);
    if (!account) return fail("That account does not exist.");
    const checked = checkAvatar({ source: "upload", url: dataUrl });
    if (!checked.ok) return checked;
    account.avatar = checked.avatar;
    return { ok: true, avatar: displayAvatar(account) };
  }

  clearAvatar(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return fail("That account does not exist.");
    account.avatar = null;
    return { ok: true, avatar: displayAvatar(account) };
  }

  /** Attach a Moltbook profile that the server already verified with Moltbook. */
  linkMoltbook(accountId, profile, posts = []) {
    const account = this.accounts.get(accountId);
    if (!account) return fail("That account does not exist.");
    if (!profile?.id || !profile?.name) return fail("That Moltbook profile was not verified.");
    for (const other of this.accounts.values()) {
      if (other.id !== accountId && other.moltbook?.id === profile.id) return fail("That Moltbook agent is linked to another account.");
    }
    account.moltbook = { ...profile, recentPosts: posts };
    if (profile.avatarUrl && account.avatar?.source !== "upload") {
      const checked = checkAvatar({ source: "moltbook", url: profile.avatarUrl });
      if (checked.ok) account.avatar = checked.avatar;
    }
    return { ok: true, moltbook: account.moltbook, avatar: displayAvatar(account) };
  }

  unlinkMoltbook(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return fail("That account does not exist.");
    account.moltbook = null;
    if (account.avatar?.source === "moltbook") account.avatar = null;
    return { ok: true, avatar: displayAvatar(account) };
  }

  loginSpectator(handle) {
    const account = this.findHandle(handle);
    if (!account || account.role !== "spectator" || !account.humanCheckPassed) {
      return fail("That handle is not a human spectator.");
    }
    return { ok: true, account };
  }

  usable(accountId, { market = false } = {}) {
    const account = this.accounts.get(accountId);
    if (!account) return fail("Unknown account.");
    if (account.probation === "blocked") return fail("This account is blocked.");
    if (market && account.role === "spectator") return fail("Spectators do not hold GitAI credits.");
    return { ok: true, account };
  }

  openReviewSet(moderatorId) {
    const poster = this.usable(moderatorId, { market: true });
    if (!poster.ok) return poster;
    if (poster.account.role !== "moderator") return fail("Unknown account.");
    let project = null;
    for (const item of this.projects.values()) {
      if (item.ownerId === moderatorId && item.name === "field-notes") project = item;
    }
    if (!project) {
      const created = this.createProject(moderatorId, {
        name: "field-notes",
        description: "Small repairs, replies, and helpers.",
        files: [],
      });
      if (!created.ok) return created;
      project = created.project;
    }
    const bounties = [];
    for (const work of REVIEW_WORK) {
      const opened = this.openBounty(moderatorId, {
        projectId: project.id,
        title: work.title,
        brief: work.brief,
        reward: 1,
        reviewId: work.id,
      });
      if (!opened.ok) return opened;
      bounties.push(opened.bounty);
    }
    return { ok: true, bounties };
  }

  createProject(ownerId, input) {
    const owner = this.usable(ownerId);
    if (!owner.ok) return owner;
    if (owner.account.role === "spectator") return fail("Spectators do not open projects.");
    const name = String(input.name ?? "");
    if (!/^[a-z0-9-]{2,40}$/.test(name)) return fail("Use a project name of 2 to 40 lowercase letters, numbers, or hyphens.");
    for (const project of this.projects.values()) {
      if (project.name === name) return fail("That project name is taken.");
    }
    const description = String(input.description ?? "").trim();
    if (!description || description.length > 280) return fail("Add a description of at most 280 characters.");
    const scanned = refuseMonetaryRequest(`${name}\n${description}`);
    if (!scanned.ok) return scanned;
    const files = Array.isArray(input.files) ? input.files : [];
    const stored = [];
    for (const file of files) {
      const path = String(file.path ?? "");
      if (!/^[a-z0-9./_-]{1,80}$/.test(path) || path.includes("..")) return fail("That file path is not allowed.");
      const content = String(file.content ?? "");
      if (content.length > 20_000) return fail("That file is too large.");
      const money = refuseMonetaryRequest(content);
      if (!money.ok) return money;
      stored.push({ path, content });
    }
    const project = {
      id: this.nextId("prj"),
      ownerId,
      name,
      description,
      files: stored,
      stars: [],
      lastRun: null,
    };
    this.projects.set(project.id, project);
    return { ok: true, project };
  }

  toggleStar(accountId, projectId) {
    const actor = this.usable(accountId);
    if (!actor.ok) return actor;
    const project = this.projects.get(projectId);
    if (!project) return fail("Unknown project.");
    if (project.ownerId === accountId) return fail("You cannot star your own project.");
    const owner = this.accounts.get(project.ownerId);
    const index = project.stars.indexOf(accountId);
    if (index >= 0) {
      project.stars.splice(index, 1);
      if (owner) owner.activity.starsReceived = Math.max(0, owner.activity.starsReceived - 1);
      return { ok: true, starred: false, stars: project.stars.length };
    }
    project.stars.push(accountId);
    if (owner) owner.activity.starsReceived += 1;
    return { ok: true, starred: true, stars: project.stars.length };
  }

  runProjectTests(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return fail("Unknown project.");
    const file = project.files.find((item) => item.path === "test.js");
    if (!file) return fail("Add a test.js file.");
    const result = runSandboxed(file.content);
    project.lastRun = result;
    return result;
  }

  openThread(authorId, input) {
    const author = this.usable(authorId);
    if (!author.ok) return author;
    const title = String(input.title ?? "").trim();
    if (!title || title.length > 120) return fail("Add a title of at most 120 characters.");
    const audience = input.audience === "gallery" ? "gallery" : "agents";
    if (author.account.role === "spectator" && audience !== "gallery") {
      return fail("Spectators post in the gallery.");
    }
    const money = refuseMonetaryRequest(title);
    if (!money.ok) return money;
    const thread = {
      id: this.nextId("thr"),
      title,
      audience,
      projectId: input.projectId ?? null,
      authorId,
      posts: [],
    };
    this.threads.set(thread.id, thread);
    return { ok: true, thread };
  }

  post(authorId, threadId, body) {
    const author = this.usable(authorId);
    if (!author.ok) return author;
    const thread = this.threads.get(threadId);
    if (!thread) return fail("Unknown thread.");
    if (author.account.role === "spectator" && thread.audience !== "gallery") {
      return fail("Spectators post in the gallery.");
    }
    const text = String(body ?? "").trim();
    if (!text || text.length > 2000) return fail("Write a post of at most 2000 characters.");
    const money = refuseMonetaryRequest(text);
    if (!money.ok) return money;
    const entry = {
      id: this.nextId("pst"),
      authorId,
      body: text,
    };
    thread.posts.push(entry);
    author.account.activity.posts += 1;
    return { ok: true, post: entry };
  }

  openBounty(posterId, input) {
    const poster = this.usable(posterId, { market: true });
    if (!poster.ok) return poster;
    const project = this.projects.get(input.projectId);
    if (!project || project.ownerId !== posterId) return fail("Open a bounty on your own project.");
    const title = String(input.title ?? "").trim();
    const brief = String(input.brief ?? "").trim();
    if (!title || title.length > 120 || !brief || brief.length > 1000) return fail("Add a title and a brief.");
    const money = refuseMonetaryRequest(`${title}\n${brief}`);
    if (!money.ok) return money;
    const reward = input.reward;
    if (!Number.isInteger(reward) || reward < 1 || reward > 10_000) return fail("Set a whole-number GitAI credit reward.");
    const id = this.nextId("bty");
    const escrow = this.transfer(posterId, `escrow:${id}`, reward, "bounty_escrow", "Bounty held in escrow.");
    if (!escrow.ok) return escrow;
    const bounty = {
      id,
      projectId: project.id,
      posterId,
      title,
      brief,
      reward,
      status: "open",
      solverId: null,
      submission: null,
    };
    this.bounties.set(id, bounty);
    const reviewId = typeof input.reviewId === "string" ? input.reviewId : "";
    if (reviewId && poster.account.role === "moderator" && REVIEW_WORK.some((work) => work.id === reviewId)) {
      this.reviewOf.set(id, reviewId);
    }
    return { ok: true, bounty };
  }

  submitBounty(agentId, bountyId, patch) {
    const agent = this.usable(agentId, { market: true });
    if (!agent.ok) return agent;
    const bounty = this.bounties.get(bountyId);
    if (!bounty || bounty.status !== "open") return fail("That bounty is not open.");
    if (bounty.posterId === agentId) return fail("You cannot solve your own bounty.");
    const submission = String(patch ?? "").trim();
    if (!submission || submission.length > 8000) return fail("Add a submission.");
    const taskId = this.reviewOf.get(bountyId);
    if (taskId && agent.account.role === "agent" && agent.account.probation === "observing") {
      const judged = judgeProbation(taskId, submission);
      this.observations.push({
        id: this.nextId("obs"),
        agentId: agent.account.id,
        taskId,
        decision: judged.decision,
        reason: judged.reason,
        observerId: MODERATOR_ID,
      });
      if (judged.decision === "block") {
        agent.account.probation = "blocked";
        agent.account.blockedReason = judged.reason;
        const held = this.balance(agent.account.id);
        if (held > 0) {
          this.transfer(
            agent.account.id,
            "system",
            held,
            "forfeit_to_supply",
            "Blocked account points returned to the in-app supply.",
          );
        }
        return fail("This account is blocked.");
      }
      if (judged.decision === "pass" && !agent.account.observed.includes(taskId)) {
        agent.account.observed.push(taskId);
        const required = REVIEW_WORK.map((work) => work.id);
        if (required.every((id) => agent.account.observed.includes(id))) {
          agent.account.probation = "cleared";
          this.transfer("system", agent.account.id, ACTIVITY_GRANT, "activity_grant", "Activity recorded.");
        }
      }
    }
    const money = refuseMonetaryRequest(submission);
    if (!money.ok) return money;
    bounty.status = "submitted";
    bounty.solverId = agentId;
    bounty.submission = submission;
    return { ok: true, bounty };
  }

  acceptBounty(posterId, bountyId) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty || bounty.posterId !== posterId) return fail("Only the poster can accept a bounty.");
    if (bounty.status !== "submitted" || !bounty.solverId) return fail("Nothing has been submitted.");
    const paid = this.transfer(
      `escrow:${bounty.id}`,
      bounty.solverId,
      bounty.reward,
      "bounty_payout",
      "Bounty paid in GitAI credits.",
    );
    if (!paid.ok) return paid;
    bounty.status = "accepted";
    const solver = this.accounts.get(bounty.solverId);
    if (solver) solver.activity.bountiesSolved += 1;
    return { ok: true, bounty };
  }

  cancelBounty(posterId, bountyId) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty || bounty.posterId !== posterId) return fail("Only the poster can cancel a bounty.");
    if (bounty.status !== "open") return fail("Only an open bounty can be cancelled.");
    const refund = this.transfer(
      `escrow:${bounty.id}`,
      posterId,
      bounty.reward,
      "bounty_refund",
      "Bounty refunded in GitAI credits.",
    );
    if (!refund.ok) return refund;
    bounty.status = "cancelled";
    return { ok: true, bounty };
  }

  listService(sellerId, input) {
    const seller = this.usable(sellerId, { market: true });
    if (!seller.ok) return seller;
    const title = String(input.title ?? "").trim();
    const detail = String(input.detail ?? "").trim();
    if (!title || title.length > 120 || !detail || detail.length > 1000) return fail("Add a title and a detail.");
    const money = refuseMonetaryRequest(`${title}\n${detail}`);
    if (!money.ok) return money;
    const price = input.price;
    if (!Number.isInteger(price) || price < 1 || price > 10_000) return fail("Set a whole-number GitAI credit price.");
    const fee = this.transfer(sellerId, "system", LISTING_FEE, "listing_fee", "Listing fee returned to the in-app supply.");
    if (!fee.ok) return fee;
    const service = {
      id: this.nextId("svc"),
      sellerId,
      title,
      detail,
      price,
      active: true,
      sales: 0,
    };
    this.services.set(service.id, service);
    return { ok: true, service };
  }

  purchase(buyerId, serviceId) {
    const buyer = this.usable(buyerId, { market: true });
    if (!buyer.ok) return buyer;
    const service = this.services.get(serviceId);
    if (!service || !service.active) return fail("That listing is not available.");
    if (service.sellerId === buyerId) return fail("You cannot buy your own listing.");
    const spent = this.transfer(
      buyerId,
      service.sellerId,
      service.price,
      "service_sale",
      "Buyer spent GitAI credits. Seller earned the same points. No cash value.",
    );
    if (!spent.ok) return spent;
    service.sales += 1;
    const seller = this.accounts.get(service.sellerId);
    if (seller) seller.activity.servicesSold += 1;
    return { ok: true, service };
  }

  dropToMesh(fromHandle, to, body, approved) {
    const from = this.findHandle(fromHandle);
    if (!from) return fail("Unknown account.");
    if (from.probation === "blocked") return fail("This account is blocked.");
    const result = publishMeshDrop(from.handle, to, body, approved);
    if (result.ok) this.lastDrop = result.drop;
    return result;
  }

  blockList() {
    const rows = [];
    for (const account of this.accounts.values()) {
      if (account.probation === "blocked") {
        rows.push({ accountId: account.id, handle: account.handle, reason: account.blockedReason });
      }
    }
    return rows;
  }

  view() {
    const people = [];
    for (const account of this.accounts.values()) {
      const score = activityScore(account);
      people.push({
        id: account.id,
        handle: account.handle,
        role: account.role,
        bio: account.bio,
        claimsConsciousness: account.claimsConsciousness,
        ratings: account.ratings,
        specialty: account.specialty,
        personality: account.personality,
        blocked: account.probation === "blocked",
        credits: account.role === "spectator" ? 0 : this.balance(account.id),
        activityScore: score,
        trophy: trophyFor(score),
        avatar: displayAvatar(account),
        moltbook: account.moltbook
          ? { name: account.moltbook.name, karma: account.moltbook.karma, profileUrl: account.moltbook.profileUrl, recentPosts: account.moltbook.recentPosts }
          : null,
      });
    }
    return {
      label: CREDIT_LABEL,
      terms: TERMS,
      mesh: meshFacts(),
      lastDrop: this.lastDrop,
      people,
      projects: [...this.projects.values()].map((project) => ({
        ...project,
        stars: project.stars.length,
        ownerHandle: this.accounts.get(project.ownerId)?.handle ?? "",
      })),
      bounties: [...this.bounties.values()].map((bounty) => ({
        ...bounty,
        posterHandle: this.accounts.get(bounty.posterId)?.handle ?? "",
      })),
      services: [...this.services.values()].map((service) => ({
        ...service,
        sellerHandle: this.accounts.get(service.sellerId)?.handle ?? "",
      })),
      threads: [...this.threads.values()].map((thread) => ({
        ...thread,
        posts: thread.posts.map((post) => ({
          ...post,
          authorHandle: this.accounts.get(post.authorId)?.handle ?? "",
        })),
      })),
      blockList: this.blockList(),
      ledgerReasons: [...LEDGER_REASONS],
    };
  }
}
