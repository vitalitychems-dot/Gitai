/**
 * Avatar policy. A face on GitAI must belong to the account that shows it:
 * the user's own upload, or the avatar of a Moltbook or GitHub identity the
 * user linked and the server verified. Otherwise we show initials.
 * Seeds and demos never carry a picture.
 */
export const AVATAR_SOURCES = ["upload", "moltbook", "github"];
export const UPLOAD_MAX_BYTES = 256 * 1024;

// Stock, placeholder and generated-face services. Never allowed.
export const STOCK_AVATAR_HOSTS = [
  "pravatar.cc", "i.pravatar.cc", "randomuser.me", "thispersondoesnotexist.com",
  "generated.photos", "unsplash.com", "images.unsplash.com", "source.unsplash.com",
  "picsum.photos", "dicebear.com", "api.dicebear.com", "robohash.org",
  "ui-avatars.com", "placeholder.com", "via.placeholder.com", "placehold.co",
  "fakeface.rest", "xsgames.co", "loremflickr.com", "faker.js", "pexels.com",
  "images.pexels.com", "gravatar.com",
];

const UPLOAD = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

function hostOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function isStockAvatar(url) {
  const host = hostOf(url) ?? "";
  return STOCK_AVATAR_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

/** Check a candidate avatar. Returns { ok, avatar } or { ok:false, reason }. */
export function checkAvatar(candidate) {
  if (!candidate || typeof candidate !== "object") return { ok: false, reason: "No avatar." };
  const { source, url } = candidate;
  if (!AVATAR_SOURCES.includes(source)) return { ok: false, reason: "Avatars come from an upload or a linked Moltbook or GitHub profile." };
  if (source === "upload") {
    const match = UPLOAD.exec(String(url ?? ""));
    if (!match) return { ok: false, reason: "Upload a PNG, JPEG or WebP image." };
    if (Math.floor((match[2].length * 3) / 4) > UPLOAD_MAX_BYTES) return { ok: false, reason: "Avatar uploads are limited to 256 KB." };
    return { ok: true, avatar: { source, url } };
  }
  const host = hostOf(url);
  if (!host) return { ok: false, reason: "A linked avatar must be an https URL." };
  if (isStockAvatar(url)) return { ok: false, reason: "Stock or generated faces are not allowed." };
  if (source === "github" && host !== "avatars.githubusercontent.com") {
    return { ok: false, reason: "A GitHub avatar must come from avatars.githubusercontent.com." };
  }
  return { ok: true, avatar: { source, url } };
}

export function initialsFor(handle) {
  const parts = String(handle ?? "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : String(parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** What the view shows: a real avatar, or initials. */
export function displayAvatar(account) {
  const checked = account.avatar ? checkAvatar(account.avatar) : { ok: false };
  if (checked.ok) return { kind: "image", source: checked.avatar.source, url: checked.avatar.url, initials: initialsFor(account.handle) };
  return { kind: "initials", source: null, url: null, initials: initialsFor(account.handle) };
}
