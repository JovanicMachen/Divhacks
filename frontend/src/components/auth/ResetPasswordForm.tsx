"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AuthShell, FieldError, FormError } from "./AuthShell";
import { PasswordField } from "./PasswordField";
import { useSingleSubmit } from "./useSingleSubmit";
import { useAccount } from "@/components/account/AccountProvider";
import {
  captureAuthCallback,
  clearPasswordRecoveryFlag,
  hasPasswordRecoveryFlag,
  isFailedAuthCallback,
  isRecoveryCallback,
} from "@/lib/auth-callback";
import { PASSWORD_UPDATED, passwordResetFieldErrors } from "@/lib/password-reset";
import { getSupabase } from "@/lib/supabase/client";
import { LABEL, PRIMARY_BUTTON } from "@/lib/form-styles";
import { cn } from "@/lib/utils";

const EXPIRED = "This password reset link is invalid or has expired.";

/** Landing page for Supabase's password-recovery email link. */
export function ResetPasswordForm() {
  const { status, passwordRecovery, updatePassword, signOut, setFlash } = useAccount();
  const router = useRouter();
  const { pending, start, finish } = useSingleSubmit();
  const finished = useRef(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">("checking");
  const [done, setDone] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const callback = captureAuthCallback();
    if (!callback.tokenHash || callback.type !== "recovery") return;
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    setVerifying(true);
    supabase.auth.verifyOtp({ token_hash: callback.tokenHash, type: "recovery" }).then(({ error: verifyError }) => {
      if (!active) return;
      if (verifyError) setPhase("invalid");
      setVerifying(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (finished.current || done || verifying) return;
    const failed = isFailedAuthCallback();
    const present = isRecoveryCallback();
    if (failed) {
      clearPasswordRecoveryFlag();
      setPhase("invalid");
      return;
    }
    if (passwordRecovery || hasPasswordRecoveryFlag()) {
      if (status === "loading") return;
      if (status === "signedIn") {
        setPhase("ready");
        return;
      }
      clearPasswordRecoveryFlag();
      setPhase("invalid");
      return;
    }
    if (status === "loading") return;
    if (!present) {
      setPhase("invalid");
      return;
    }
    const id = window.setTimeout(() => setPhase((current) => (current === "checking" ? "invalid" : current)), 800);
    return () => window.clearTimeout(id);
  }, [status, passwordRecovery, done, verifying]);

  if (done) {
    return (
      <AuthShell title={PASSWORD_UPDATED} subtitle="Sign in with your new password.">
        <Link href="/login" className={cn(PRIMARY_BUTTON, "w-full")}>
          Back to Sign In
        </Link>
      </AuthShell>
    );
  }

  if (phase === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-faint">
        <Loader2 size={22} className="animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthShell title={EXPIRED}>
        <a href="/login?forgot=1" className={cn(PRIMARY_BUTTON, "w-full")}>
          Request a new reset link
        </a>
      </AuthShell>
    );
  }

  const errors = passwordResetFieldErrors(password, confirm);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start()) return;
    setError(null);
    try {
      if (errors.password || errors.confirm) {
        setShowErrors(true);
        return;
      }
      const failure = await updatePassword(password);
      if (failure) {
        setError(failure.message);
        if (failure.message === EXPIRED) {
          clearPasswordRecoveryFlag();
          setPhase("invalid");
        }
        return;
      }
      finished.current = true;
      setPassword("");
      setConfirm("");
      setDone(true);
      setFlash(PASSWORD_UPDATED);
      clearPasswordRecoveryFlag();
      await signOut();
      router.replace("/login?updated=1");
    } finally {
      if (!finished.current) finish();
    }
  };

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} noValidate className="space-y-[18px]">
        <div>
          <label htmlFor="reset-password" className={LABEL}>
            New password
          </label>
          <PasswordField
            id="reset-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            invalid={showErrors && Boolean(errors.password)}
            describedBy="reset-password-error"
          />
          <FieldError id="reset-password-error" message={showErrors ? errors.password : null} />
        </div>
        <div>
          <label htmlFor="reset-confirm" className={LABEL}>
            Confirm new password
          </label>
          <PasswordField
            id="reset-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Type it again"
            invalid={showErrors && Boolean(errors.confirm)}
            describedBy="reset-confirm-error"
          />
          <FieldError id="reset-confirm-error" message={showErrors ? errors.confirm : null} />
        </div>
        <FormError message={error} />
        <button type="submit" disabled={pending} aria-busy={pending} className={cn(PRIMARY_BUTTON, "w-full")}>
          {pending && <Loader2 size={17} strokeWidth={2.6} className="animate-spin" aria-hidden />}
          {pending ? "Updating…" : "Update Password"}
        </button>
      </form>
    </AuthShell>
  );
}
