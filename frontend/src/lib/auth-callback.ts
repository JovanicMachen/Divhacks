/**
 * Snapshot of the auth redirect, taken before the Supabase client reads and
 * clears the URL. Holds no password. The recovery flag is only a marker that
 * this tab opened a valid reset link, so a refresh can still show the form.
 */

export type AuthCallback = {
  type: string | null;
  hasCode: boolean;
  hasAccessToken: boolean;
  tokenHash: string | null;
  error: string | null;
  errorCode: string | null;
};

const RECOVERY_FLAG = "campus-connect.password-recovery";

let captured: AuthCallback | null = null;

function emptyCallback(): AuthCallback {
  return { type: null, hasCode: false, hasAccessToken: false, tokenHash: null, error: null, errorCode: null };
}

export function captureAuthCallback(): AuthCallback {
  if (captured) return captured;
  if (typeof window === "undefined") {
    captured = emptyCallback();
    return captured;
  }
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const pick = (key: string) => url.searchParams.get(key) ?? hash.get(key);
  captured = {
    type: pick("type"),
    hasCode: Boolean(pick("code")),
    hasAccessToken: Boolean(pick("access_token")),
    tokenHash: pick("token_hash"),
    error: pick("error"),
    errorCode: pick("error_code"),
  };
  return captured;
}

export function isRecoveryCallback(callback: AuthCallback = captureAuthCallback()): boolean {
  return callback.type === "recovery" || callback.hasCode || callback.hasAccessToken || Boolean(callback.tokenHash);
}

export function isFailedAuthCallback(callback: AuthCallback = captureAuthCallback()): boolean {
  return Boolean(callback.error || callback.errorCode);
}

export function markPasswordRecovery(): void {
  try {
    window.sessionStorage.setItem(RECOVERY_FLAG, "1");
  } catch {
    // Private mode can block storage. The in-memory recovery flag still works.
  }
}

export function hasPasswordRecoveryFlag(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) === "1";
  } catch {
    return false;
  }
}

export function clearPasswordRecoveryFlag(): void {
  try {
    window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // Nothing to clear.
  }
}
