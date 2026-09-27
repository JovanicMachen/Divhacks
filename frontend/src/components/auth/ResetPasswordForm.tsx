"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AuthShell, FieldError, FormError } from "./AuthShell";
import { PasswordField } from "./PasswordField";
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
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    if (errors.password || errors.confirm) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    const message = await updatePassword(password);
    setBusy(false);
    if (message) setError(message);
    else router.push("/");
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
        <FormError message={error} />
        <button type="submit" disabled={busy} className={cn(PRIMARY_BUTTON, "w-full")}>
          {busy && <Loader2 size={17} strokeWidth={2.6} className="animate-spin" aria-hidden />}
          Update password
        </button>
      </form>
    </AuthShell>
  );
}
