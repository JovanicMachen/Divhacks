import type { AccountUser, Profile, ProfileInput } from "@/types/profile";

export const DEFAULT_UNIVERSITY = "Columbia University";
export const BIO_MAX = 150;
export const DISPLAY_NAME_MAX = 50;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** profiles.display_name → auth metadata → email username → generic fallback. */
export function displayNameFor(user: AccountUser | null, profile: Profile | null): string {
  return (
    profile?.display_name?.trim() ||
    user?.metadataDisplayName?.trim() ||
    user?.email?.split("@")[0] ||
    "Campus Connect User"
  );
}

/** "@username" when set, otherwise the real email address. */
export function handleFor(user: AccountUser | null, profile: Profile | null): string | null {
  if (profile?.username) return `@${profile.username}`;
  return user?.email ?? null;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** Drops a leading "@" and anything outside the allowed username alphabet. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Adds https:// to bare domains; returns null for anything that isn't a web URL. */
export function normalizeWebsite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export type ProfileErrors = Partial<Record<keyof ProfileInput, string>>;

export function validateProfile(input: ProfileInput): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = input.display_name.trim();
  if (!name) errors.display_name = "Add a display name.";
  else if (name.length > DISPLAY_NAME_MAX) errors.display_name = `Keep it under ${DISPLAY_NAME_MAX} characters.`;

  const username = normalizeUsername(input.username);
  if (!username) errors.username = "Choose a username.";
  else if (!/^[a-z0-9._]+$/.test(username))
    errors.username = "Use lowercase letters, numbers, underscores, or periods only.";
  else if (username.length < USERNAME_MIN || username.length > USERNAME_MAX)
    errors.username = `Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  else if (/^\.|\.$|\.\./.test(username)) errors.username = "Periods can't start, end, or repeat.";

  if (input.bio.length > BIO_MAX) errors.bio = `Bios are limited to ${BIO_MAX} characters.`;
  if (normalizeWebsite(input.website) === null) errors.website = "Enter a valid website, like example.com.";
  if (!input.university.trim()) errors.university = "Add your university.";
  return errors;
}

/**
 * Downscales a picked photo to a square JPEG so uploads stay small
 * (a 256px avatar is typically 15–30 KB).
 */
export async function resizeAvatar(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))), "image/jpeg", 0.86),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
