"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AuthShell, FieldError, FormError } from "./AuthShell";
import { PasswordField } from "./PasswordField";
import { useSingleSubmit } from "./useSingleSubmit";
import { useAccount } from "@/components/account/AccountProvider";
import { PASSWORD_MIN } from "@/lib/auth-validation";
import { LABEL, PRIMARY_BUTTON } from "@/lib/form-styles";
import { cn } from "@/lib/utils";

/** Landing page for Supabase's password-recovery email link. */
export function ResetPasswordForm() {
  const { status, updatePassword } = useAccount();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending, start, finish } = useSingleSubmit();
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<{ seconds: number; issuedAt: number } | null>(null);

  if (status === "loading")
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-faint">
        <Loader2 size={22} className="animate-spin" aria-label="Loading" />
      </div>
    );

  if (status === "signedOut")
    return (
      <AuthShell title="This reset link has expired" subtitle="Request a new link from the sign-in page.">
        <Link href="/login" className={cn(PRIMARY_BUTTON, "w-full")}>
          Back to Sign In
        </Link>
      </AuthShell>
    );

  const errors = {
    password: password.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters.` : null,
    confirm: confirm !== password ? "Passwords don't match." : null,
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start()) return;
    setError(null);
    setWait(null);
    try {
      if (errors.password || errors.confirm) {
        setShowErrors(true);
        return;
      }
      const failure = await updatePassword(password);
      if (failure) {
        setError(failure.message);
        setWait(
          failure.retryAfterSeconds ? { seconds: failure.retryAfterSeconds, issuedAt: Date.now() } : null,
        );
        return;
      }
      router.push("/");
    } finally {
      finish();
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
            invalid={showErrors && Boolean(errors.confirm)}
            describedBy="reset-confirm-error"
          />
          <FieldError id="reset-confirm-error" message={showErrors ? errors.confirm : null} />
        </div>
        <FormError message={error} wait={wait} />
        <button type="submit" disabled={pending} aria-busy={pending} className={cn(PRIMARY_BUTTON, "w-full")}>
          {pending && <Loader2 size={17} strokeWidth={2.6} className="animate-spin" aria-hidden />}
          Update password
        </button>
      </form>
    </AuthShell>
  );
}
