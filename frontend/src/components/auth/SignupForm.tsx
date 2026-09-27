"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";

import { AuthShell, FieldError, FormError } from "./AuthShell";
import { PasswordField } from "./PasswordField";
import { useSingleSubmit } from "./useSingleSubmit";
import { useAccount } from "@/components/account/AccountProvider";
import { DISPLAY_NAME_MAX } from "@/lib/account";
import { PASSWORD_MIN, isValidEmail } from "@/lib/auth-validation";
import { INPUT, LABEL, PRIMARY_BUTTON } from "@/lib/form-styles";
import { cn } from "@/lib/utils";

type Field = "name" | "email" | "password" | "confirm";

export function SignupForm() {
  const { signUp } = useAccount();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending, start, finish } = useSingleSubmit();
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<{ seconds: number; issuedAt: number } | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const errors: Partial<Record<Field, string>> = {};
  if (!name.trim()) errors.name = "Enter your display name.";
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!isValidEmail(email)) errors.email = "Please enter a valid email address.";
  if (password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  if (!confirm) errors.confirm = "Confirm your password.";
  else if (confirm !== password) errors.confirm = "Passwords don't match.";
  const shown = (field: Field) => (showErrors ? errors[field] : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start()) return;
    setError(null);
    setWait(null);
    try {
      if (Object.keys(errors).length > 0) {
        setShowErrors(true);
        return;
      }
      const result = await signUp(email.trim(), password, name.trim());
      if (result.error) {
        setError(result.error);
        setWait(result.retryAfterSeconds ? { seconds: result.retryAfterSeconds, issuedAt: Date.now() } : null);
        return;
      }
      if (result.needsConfirmation) {
        setConfirmSent(true);
        return;
      }
      router.push("/");
    } finally {
      finish();
    }
  };

  if (confirmSent) {
    return (
      <AuthShell title="Check your email to confirm your account.">
        <div className="flex items-start gap-3 rounded-[14px] bg-brand-tint px-4 py-3.5">
          <MailCheck size={20} strokeWidth={2.2} aria-hidden className="mt-[1px] shrink-0 text-brand" />
          <p className="text-[14px] font-medium leading-[1.45] text-ink-soft">
            We sent a confirmation link to <strong className="font-bold text-ink">{email.trim()}</strong>. Open it,
            then sign in to start using Campus Connect.
          </p>
        </div>
        <Link href="/login" className={cn(PRIMARY_BUTTON, "mt-5 w-full")}>
          Back to Sign In
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Join Campus Connect"
      subtitle="Find what's happening around campus."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-brand hover:underline">
            Sign In
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-[18px]">
        <div>
          <label htmlFor="signup-name" className={LABEL}>
            Display Name
          </label>
          <input
            id="signup-name"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={DISPLAY_NAME_MAX}
            placeholder="How your name appears"
            aria-invalid={Boolean(shown("name"))}
            aria-describedby="signup-name-error"
            className={cn(INPUT, "h-12")}
          />
          <FieldError id="signup-name-error" message={shown("name")} />
        </div>

        <div>
          <label htmlFor="signup-email" className={LABEL}>
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="uni@columbia.edu"
            aria-invalid={Boolean(shown("email"))}
            aria-describedby="signup-email-error"
            className={cn(INPUT, "h-12")}
          />
          <FieldError id="signup-email-error" message={shown("email")} />
        </div>

        <div>
          <label htmlFor="signup-password" className={LABEL}>
            Password
          </label>
          <PasswordField
            id="signup-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN} characters`}
            invalid={Boolean(shown("password"))}
            describedBy="signup-password-error"
          />
          <FieldError id="signup-password-error" message={shown("password")} />
        </div>

        <div>
          <label htmlFor="signup-confirm" className={LABEL}>
            Confirm Password
          </label>
          <PasswordField
            id="signup-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Type it again"
            invalid={Boolean(shown("confirm"))}
            describedBy="signup-confirm-error"
          />
          <FieldError id="signup-confirm-error" message={shown("confirm")} />
        </div>

        <FormError message={error} wait={wait} />

        <button type="submit" disabled={pending} aria-busy={pending} className={cn(PRIMARY_BUTTON, "w-full")}>
          {pending && <Loader2 size={17} strokeWidth={2.6} className="animate-spin" aria-hidden />}
          {pending ? "Creating account…" : "Create Account"}
        </button>
      </form>
    </AuthShell>
  );
}
