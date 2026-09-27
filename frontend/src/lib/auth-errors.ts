/**
 * Turns a Supabase Auth error into copy for the sign-in and sign-up forms.
 * A server rate limit is reported as a short retry message, with no countdown.
 */

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

/** A failed auth call. */
export type AuthFailure = {
  message: string;
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

export function describeAuthError(error: AuthErrorLike): AuthFailure {
  const message = error.message ?? "";
  if (/failed to fetch|network|load failed/i.test(message)) return { message: NETWORK_ERROR };

  if (isAuthRateLimit(error)) return { message: "That didn't go through. Try again." };

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

/** Reset emails use the same success screen whether or not the address is registered. */
export function describeResetRequestError(error: AuthErrorLike): AuthFailure | null {
  if (isAuthRateLimit(error)) return describeAuthError(error);
  const message = error.message ?? "";
  if (/failed to fetch|network|load failed/i.test(message)) return describeAuthError(error);
  if (error.code === "user_not_found" || /user not found|email not found/i.test(message)) return null;
  return { message: "Couldn't send a reset link. Please try again." };
}

export function describePasswordUpdateError(error: AuthErrorLike): AuthFailure {
  if (isAuthRateLimit(error)) return describeAuthError(error);
  const message = error.message ?? "";
  if (/failed to fetch|network|load failed/i.test(message)) return { message: NETWORK_ERROR };
  if (
    error.status === 401 ||
    error.code === "session_not_found" ||
    error.code === "otp_expired" ||
    /expired|invalid.*(token|link|session)|session.*(missing|expired)/i.test(message)
  ) {
    return { message: "This password reset link is invalid or has expired." };
  }
  if (/password/i.test(message) && /(least|short|weak|characters)/i.test(message)) return describeAuthError(error);
  if (error.code === "same_password") return { message: "Choose a password you haven't used before." };
  return { message: "Couldn't update your password. Please try again." };
}
