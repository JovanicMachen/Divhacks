import { PASSWORD_MIN } from "@/lib/auth-validation";

/** Live Campus Connect site. Production never falls back to localhost. */
export const DEPLOYED_SITE_URL = "https://campus-connect-seven-snowy.vercel.app";

export const PASSWORD_UPDATED = "Password updated successfully";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

/**
 * Origin used in auth emails. Prefers NEXT_PUBLIC_SITE_URL, then the page
 * the person is actually on. A production build that is somehow still on
 * localhost uses the deployed site so the email never points at a dev machine.
 */
export function siteOrigin(currentOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const origin = currentOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!origin || (LOCAL_ORIGIN.test(origin) && process.env.NODE_ENV === "production")) return DEPLOYED_SITE_URL;
  return origin;
}

/** Supabase redirectTo for password recovery. Allow this exact URL in the dashboard. */
export function passwordResetRedirectUrl(currentOrigin?: string): string {
  return `${siteOrigin(currentOrigin)}/reset-password`;
}

export function passwordResetFieldErrors(password: string, confirm: string): {
  password: string | null;
  confirm: string | null;
} {
  return {
    password: !password
      ? "Enter a new password."
      : password.length < PASSWORD_MIN
        ? `Use at least ${PASSWORD_MIN} characters.`
        : null,
    confirm: !confirm ? "Confirm your password." : confirm !== password ? "Passwords don't match." : null,
  };
}
