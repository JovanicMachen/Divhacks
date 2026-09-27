import type { SupabaseClient } from "@supabase/supabase-js";

/** Public Storage bucket for event cover photos. Override with NEXT_PUBLIC_SUPABASE_EVENT_IMAGES_BUCKET. */
export const EVENT_IMAGES_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_EVENT_IMAGES_BUCKET ?? "event-images";

/** Matches the bucket's own limits, so bad files are caught before uploading. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function photoError(file: File): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "Use a JPG, PNG, or WebP photo.";
  if (file.size > PHOTO_MAX_BYTES) return "That photo is over 5 MB. Choose a smaller one.";
  return null;
}

/**
 * Re-encodes a photo as JPEG no larger than `maxSide` on its long edge. Drawing
 * it to a canvas also drops EXIF data, including a phone's GPS location.
 */
export async function preparePhoto(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This photo couldn't be processed. Try another one.");
  if (blob.size > PHOTO_MAX_BYTES) throw new Error("That photo is too large even after resizing. Choose a smaller one.");
  return blob;
}

/** Uploads to event-images/<userId>/<eventId>/ and returns the stored path and public URL. */
export async function uploadEventPhoto(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  photo: Blob,
): Promise<{ path: string; url: string }> {
  const path = `${userId}/${eventId}/cover-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`The photo couldn't be uploaded: ${error.message}`);
  const { data } = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/** The Storage path inside the bucket for a public URL, or null if it isn't one of ours. */
export function photoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${EVENT_IMAGES_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  return decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
}

/**
 * Removes an event's photo, but only when it sits in this user's folder for this
 * event; anything else is left alone. Failures are reported, not thrown, because
 * the event itself is already gone.
 */
export async function removeEventPhoto(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  url: string | null | undefined,
): Promise<void> {
  const path = photoPathFromUrl(url);
  if (!path || !path.startsWith(`${userId}/${eventId}/`)) return;
  const { error } = await supabase.storage.from(EVENT_IMAGES_BUCKET).remove([path]);
  if (error) console.warn("Event deleted, but its photo couldn't be removed:", error.message);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
