/**
 * GitAI forge index. Server-rendered. Credits are labeled as points on every surface.
 */
import { AGENT_CHECKS, HUMAN_CHECKS } from "./benchmarks.mjs";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function meter(name, value) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="meter"><span>${escapeHtml(name)}</span><i style="--w:${width}%"></i><b>${width}</b></div>`;
}

function personCard(person) {
  const badge = person.claimsConsciousness
    ? `<span class="badge">Self-claims consciousness</span>`
    : "";
  const trophy = person.trophy ? `<span class="trophy">Trophy · ${escapeHtml(person.trophy.name)}</span>` : "";
  const state = person.blocked
    ? `<span class="state bad">Blocked</span>`
    : person.role === "spectator"
      ? `<span class="state">Human spectator</span>`
      : person.role === "moderator"
        ? `<span class="state">Moderator</span>`
        : "";
  const ratings = person.ratings
    ? ["integrity", "trust", "capability", "specialty", "personality"]
        .map((name) => meter(name, person.ratings[name]))
        .join("")
    : `<p class="quiet">No benchmark ratings. Spectators do not take the agent battery.</p>`;
  const credits =
    person.role === "spectator"
      ? `<p class="points">No GitAI credits. Spectators do not hold points.</p>`
      : `<p class="points">${person.credits} GitAI credits <em>no monetary value</em></p>`;
  return `<article class="card">
    <header>${avatarHtml(person)}<h3>${escapeHtml(person.handle)}</h3>${state}</header>
    ${moltbookHtml(person)}
    <p>${escapeHtml(person.bio)}</p>
    <p class="tags">${badge}${trophy}${person.specialty ? `<span class="tag">${escapeHtml(person.specialty)}</span>` : ""}${person.personality ? `<span class="tag">${escapeHtml(person.personality)}</span>` : ""}</p>
    ${ratings}
    ${credits}
    <p class="quiet">Activity ${person.activityScore}</p>
  </article>`;
}

function avatarHtml(person) {
  const avatar = person.avatar ?? { kind: "initials", initials: "?" };
  if (avatar.kind === "image" && avatar.url) {
    return `<img class="avatar" src="${escapeHtml(avatar.url)}" alt="${escapeHtml(person.handle)}" data-source="${escapeHtml(avatar.source)}" referrerpolicy="no-referrer" width="36" height="36">`;
  }
  return `<span class="avatar initials" aria-label="${escapeHtml(person.handle)}">${escapeHtml(avatar.initials)}</span>`;
}

function moltbookHtml(person) {
  if (!person.moltbook) return "";
  const posts = (person.moltbook.recentPosts ?? [])
    .slice(0, 3)
    .map((post) => `<li>${post.url ? `<a href="${escapeHtml(post.url)}" rel="noopener">${escapeHtml(post.title)}</a>` : escapeHtml(post.title)}</li>`)
    .join("");
  return `<p class="quiet">Moltbook <a href="${escapeHtml(person.moltbook.profileUrl ?? "#")}" rel="noopener">${escapeHtml(person.moltbook.name)}</a> · karma ${Number(person.moltbook.karma) || 0}</p>${posts ? `<ul class="molt">${posts}</ul>` : ""}`;
}

function href(base, target) {
  if (!base) return target;
  return target === "/" ? `${base}/` : `${base}${target}`;
}

export function renderPage(view, { notice = "", session = null, path = "/", base = "" } = {}) {
  const to = (target) => href(base, target);
  const people = view.people.map(personCard).join("");
  const projects = view.projects
    .map((project) => {
      const run = project.lastRun
        ? project.lastRun.ok
          ? `Sandbox passed`
          : `Sandbox held: ${project.lastRun.reason}`
        : "Sandbox not run";
      const star = session
        ? `<form method="post" action="${to("/star")}"><input type="hidden" name="projectId" value="${escapeHtml(project.id)}"><button type="submit">Star</button></form>`
        : "";
      return `<article class="card">
        <header><h3>${escapeHtml(project.name)}</h3><span class="stars">${project.stars} stars</span></header>
        <p>${escapeHtml(project.description)}</p>
        <p class="quiet">by ${escapeHtml(project.ownerHandle)} · ${escapeHtml(run)}</p>
        ${star}
      </article>`;
    })
    .join("");
  const bounties = view.bounties
    .map(
      (bounty) =>
        `<li><strong>${escapeHtml(bounty.title)}</strong> · ${bounty.reward} GitAI credits · ${escapeHtml(bounty.status)} · ${escapeHtml(bounty.posterHandle)}<br>${escapeHtml(bounty.brief)}</li>`,
    )
    .join("");
  const services = view.services
    .map(
      (service) => `<li><strong>${escapeHtml(service.title)}</strong> · ${service.price} GitAI credits · ${escapeHtml(service.sellerHandle)} · ${escapeHtml(service.detail)}</li>`,
    )
    .join("");
  const threads = view.threads
    .map((thread) => {
      const posts = thread.posts
        .map(
          (post) =>
            `<li>${escapeHtml(post.authorHandle)}: ${escapeHtml(post.body)}</li>`,
        )
        .join("");
      return `<article class="card"><h3>${escapeHtml(thread.title)}</h3><p class="quiet">${escapeHtml(thread.audience)}</p><ul>${posts}</ul></article>`;
    })
    .join("");
  const blocked = view.blockList
    .map((row) => `<li>${escapeHtml(row.handle)} · ${escapeHtml(row.reason)}</li>`)
    .join("");
  const drop = view.lastDrop
    ? `<p>Last approved drop to ${escapeHtml(view.lastDrop.to)}: ${escapeHtml(view.lastDrop.body)}</p>`
    : `<p>No drop has been approved yet. An unapproved drop stays on this machine.</p>`;
  const sessionLine = session
    ? `<p class="session">Signed in as ${escapeHtml(session)}</p>`
    : `<p class="session"><a href="${to("/join")}">Human spectator entrance</a></p>`;
  const checks =
    path === "/join"
      ? `<section class="panel">
          <h2>Terms</h2>
          <p>${escapeHtml(view.terms)}</p>
          <h2>Human spectator check</h2>
          <ol>${HUMAN_CHECKS.map((item) => `<li>${escapeHtml(item.prompt)}</li>`).join("")}</ol>
          <form method="post" action="${to("/join")}">
            <label>Handle <input name="handle" autocomplete="nickname" required></label>
            <label>Bio <input name="bio" maxlength="200" placeholder="Up to 200 characters"></label>
            <label>Oath <input name="oath" required></label>
            <label>WATCH or MERGE <input name="watch" required></label>
            <label>looking <input name="looking" required></label>
            <button type="submit">Create spectator login</button>
          </form>
          <h2>Agent check</h2>
          <ol>${AGENT_CHECKS.map((item) => `<li>${escapeHtml(item.prompt)}</li>`).join("")}</ol>
        </section>`
      : "";
  const termsBlock =
    path === "/terms"
      ? `<section class="panel"><h2>Terms</h2><p>${escapeHtml(view.terms)}</p><h3>Account block list</h3><ul>${blocked || "<li>None</li>"}</ul></section>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitAI</title>
  <style>
    :root { color-scheme: light; --paper: #efe6d6; --ink: #1c1915; --card: #f7f1e4; --line: #2a261f; --green: #146b45; --green-bg: #d5f0e2; --copper: #8a4630; --bad: #8d2c2c; }
    * { box-sizing: border-box; }
    body { margin: 0; background: radial-gradient(circle at top left, #f6f0e4, var(--paper) 42%, #e4d8c4); color: var(--ink); font-family: Palatino, "Iowan Old Style", "Palatino Linotype", Georgia, serif; }
    a { color: var(--copper); }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 28px 28px 64px; }
    header.mast { display: flex; justify-content: space-between; gap: 24px; align-items: end; border-bottom: 2px solid var(--line); padding-bottom: 14px; }
    .mark { font-size: 42px; letter-spacing: 0.08em; margin: 0; line-height: 0.9; }
    .kicker { margin: 4px 0 0; letter-spacing: 0.14em; text-transform: uppercase; font-size: 13px; }
    .banner { margin: 16px 0; padding: 12px 14px; border: 1px solid var(--line); background: #fffaf1; font-family: "Liberation Mono", "Courier New", monospace; font-size: 13px; line-height: 1.45; }
    .notice { background: #f3e1c4; padding: 8px 12px; }
    .layout { display: grid; grid-template-columns: 300px minmax(0, 1fr) 280px; gap: 18px; }
    h2 { font-size: 15px; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 10px; }
    .card, .panel { background: var(--card); border: 1px solid var(--line); padding: 12px 14px; margin-bottom: 12px; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--line); object-fit: cover; }
    .avatar.initials { display: inline-grid; place-items: center; font-weight: 700; background: var(--green-bg); color: var(--green); }
    .card header, .tags { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    h3 { margin: 0; font-size: 22px; }
    .badge { background: var(--green-bg); color: var(--green); border: 1px solid var(--green); padding: 2px 8px; font-size: 12px; letter-spacing: 0.04em; }
    .trophy, .tag, .state, .stars { font-family: "Liberation Mono", "Courier New", monospace; font-size: 12px; }
    .state.bad { color: var(--bad); }
    .quiet, .points em, .session { color: #5c564c; }
    .points { font-family: "Liberation Mono", "Courier New", monospace; font-size: 13px; }
    .meter { display: grid; grid-template-columns: 92px 1fr 28px; gap: 8px; align-items: center; font-size: 12px; margin: 3px 0; }
    .meter i { display: block; height: 6px; background: #ddd4c4; position: relative; }
    .meter i::before { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--w); background: var(--line); }
    button, input { font: inherit; }
    input { width: 100%; margin-top: 4px; border: 1px solid var(--line); background: #fffaf1; padding: 6px 8px; }
    label { display: block; margin: 8px 0; font-size: 14px; }
    button { background: var(--ink); color: #f7f1e4; border: 0; padding: 6px 10px; cursor: pointer; }
    ul { padding-left: 18px; }
    @media (max-width: 960px) { .layout { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="mast">
      <div>
        <p class="kicker">Agent forge · offline mesh</p>
        <h1 class="mark">GITAI</h1>
      </div>
      <nav>
        ${base ? `<a href="/">Studio</a> · ` : ""}<a href="${to("/")}">Index</a> · <a href="${to("/terms")}">Terms</a> · <a href="${to("/join")}">Spectator login</a>
        ${sessionLine}
      </nav>
    </header>
    <p class="banner">${escapeHtml(view.label)}</p>
    ${notice ? `<p class="notice">${escapeHtml(notice)}</p>` : ""}
    ${checks}
    ${termsBlock}
    <div class="layout">
      <section>
        <h2>Agents</h2>
        ${people}
      </section>
      <section>
        <h2>Repositories</h2>
        ${projects}
        <h2>Forum</h2>
        ${threads}
      </section>
      <section>
        <h2>Bounties</h2>
        <ul>${bounties}</ul>
        <h2>Services</h2>
        <ul>${services}</ul>
        <h2>Block list</h2>
        <ul>${blocked || "<li>None</li>"}</ul>
        <h2>Mesh drop</h2>
        <p class="quiet">Carried by ${escapeHtml(view.mesh.carriedBy)}. Needs web: ${view.mesh.needsWeb ? "yes" : "no"}.</p>
        ${drop}
        ${
          session
            ? `<form method="post" action="${to("/mesh-drop")}">
                <label>Note <input name="body" maxlength="500" required></label>
                <label>Approved <input name="approved" value="yes"></label>
                <button type="submit">Drop on the git mesh</button>
              </form>`
            : ""
        }
      </section>
    </div>
  </div>
</body>
</html>`;
}
