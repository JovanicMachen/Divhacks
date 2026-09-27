/**
 * Turns a Supabase Auth error into copy for the sign-in forms.
 * Rate limits stay on Supabase's side; this only names them and, when the
 * response includes a wait, how long that wait is.
 */

export const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a moment and try again.";

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

/** A failed auth call. `retryAfterSeconds` is set only for a rate-limit response that included a wait. */
export type AuthFailure = {
  message: string;
  retryAfterSeconds?: number;
};

type AuthErrorLike = {
  message?: string;
  status?: number;
  code?: string;
};

const NETWORK_ERROR = "Couldn't reach Campus Connect's servers. Check your connection and try again.";
export const BAD_CREDENTIALS = "Incorrect email or password.";
export const ACCOUNT_EXISTS = "An account with this email already exists. Sign in instead.";

export function isAuthRateLimit(error: AuthErrorLike): boolean {
  if (error.status === 429) return true;
  if (error.code && RATE_LIMIT_CODES.has(error.code)) return true;
  const message = error.message ?? "";
  return (
    /over_request_rate_limit|over_email_send_rate_limit|over_sms_send_rate_limit/i.test(message) ||
    /request rate limit reached/i.test(message) ||
    /email rate limit exceeded/i.test(message) ||
    /for security purposes, you can only request this after \d+ seconds/i.test(message)
  );
}

/** Seconds until another attempt is allowed, when the rate-limit response says so. */
export function retryAfterSeconds(error: AuthErrorLike): number | undefined {
  if (!isAuthRateLimit(error)) return undefined;
  const message = error.message ?? "";
  const match =
    message.match(/after\s+(\d+)\s+seconds?/i) ??
    message.match(/retry-after\D{0,16}(\d+)/i) ??
    message.match(/\b(\d+)\s+seconds?\b/i);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60 * 60) return undefined;
  return seconds;
}

export function rateLimitCopy(seconds: number): string {
  const unit = seconds === 1 ? "second" : "seconds";
  return `Too many attempts. Please wait ${seconds} ${unit} and try again.`;
}

export function describeAuthError(error: AuthErrorLike): AuthFailure {
  const message = error.message ?? "";
  if (/failed to fetch|network|load failed/i.test(message)) return { message: NETWORK_ERROR };

  if (isAuthRateLimit(error)) {
    const retryAfterSecondsValue = retryAfterSeconds(error);
    return retryAfterSecondsValue
      ? { message: RATE_LIMIT_MESSAGE, retryAfterSeconds: retryAfterSecondsValue }
      : { message: RATE_LIMIT_MESSAGE };
  }

  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return { message: BAD_CREDENTIALS };
  }
  if (error.code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return { message: "Confirm your email address first — check your inbox." };
  }
  if (
    error.code === "user_already_exists" ||
    error.code === "email_exists" ||
    /already registered|already exists/i.test(message)
  ) {
    return { message: ACCOUNT_EXISTS };
  }
  if (/password/i.test(message) && /(least|short|weak|characters)/i.test(message)) {
    return { message: message.replace(/^.*?(password)/i, "Password") };
  }
  if (error.code === "validation_failed" && /invalid.*email|email.*invalid/i.test(message)) {
    return { message: "Please enter a valid email address." };
  }
  if (/invalid.*email|email.*invalid/i.test(message)) return { message: "Please enter a valid email address." };
  return { message: message || "Something went wrong. Please try again." };
}
