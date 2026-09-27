"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import { AuthShell, FieldError, FormError } from "./AuthShell";
import { safeNextPath } from "./AuthGate";
import { PasswordField } from "./PasswordField";
import { useSingleSubmit } from "./useSingleSubmit";
import { useAccount } from "@/components/account/AccountProvider";
import { isValidEmail } from "@/lib/auth-validation";
import { PASSWORD_UPDATED } from "@/lib/password-reset";
import { INPUT, LABEL, PRIMARY_BUTTON } from "@/lib/form-styles";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const [view, setView] = useState<"signIn" | "forgot">("signIn");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("forgot") === "1") setView("forgot");
    if (params.get("updated") === "1") {
      setNotice(PASSWORD_UPDATED);
      params.delete("updated");
      const next = params.toString();
      window.history.replaceState(null, "", next ? `/login?${next}` : "/login");
    }
  }, []);

  return view === "signIn" ? (
    <SignInCard email={email} onEmailChange={setEmail} notice={notice} onForgot={() => setView("forgot")} />
  ) : (
    <ForgotCard email={email} onEmailChange={setEmail} onBack={() => setView("signIn")} />
  );
}

interface EmailProps {
  email: string;
  onEmailChange: (email: string) => void;
}

function SignInCard({
  email,
  onEmailChange,
  notice,
  onForgot,
}: EmailProps & { notice: string | null; onForgot: () => void }) {
  const { signIn } = useAccount();
  const router = useRouter();
  const { pending, start, finish } = useSingleSubmit();
  const [password, setPassword] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    email: !email.trim() ? "Enter your email address." : !isValidEmail(email) ? "Please enter a valid email address." : null,
    password: !password ? "Enter your password." : null,
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start()) return;
    setError(null);
    try {
      if (errors.email || errors.password) {
        setShowErrors(true);
        return;
      }
      const failure = await signIn(email.trim(), password);
      if (failure) {
        setError(failure.message);
        return;
      }
      router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    } finally {
      finish();
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see what's happening on campus."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-bold text-brand hover:underline">
            Create account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-[18px]">
        {notice && (
          <div className="rounded-[14px] bg-brand-tint px-4 py-3.5 text-[14px] font-medium leading-[1.45] text-ink-soft">
            {notice}
          </div>
        )}
        <div>
          <label htmlFor="login-email" className={LABEL}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="uni@columbia.edu"
            aria-invalid={showErrors && Boolean(errors.email)}
            aria-describedby="login-email-error"
            className={cn(INPUT, "h-12")}
          />
          <FieldError id="login-email-error" message={showErrors ? errors.email : null} />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="login-password" className={LABEL}>
              Password
            </label>
            <button
              type="button"
              onClick={onForgot}
              className="text-[13px] font-bold text-brand hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <PasswordField
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="Your password"
            invalid={showErrors && Boolean(errors.password)}
            describedBy="login-password-error"
          />
          <FieldError id="login-password-error" message={showErrors ? errors.password : null} />
        </div>

        <FormError message={error} />

        <button type="submit" disabled={pending} aria-busy={pending} className={cn(PRIMARY_BUTTON, "w-full")}>
          {pending && <Loader2 size={17} strokeWidth={2.6} className="animate-spin" aria-hidden />}
          {pending ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </AuthShell>
  );
}

function ForgotCard({ email, onEmailChange, onBack }: EmailProps & { onBack: () => void }) {
  const { requestPasswordReset } = useAccount();
  const { pending, start, finish } = useSingleSubmit();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start()) return;
    setError(null);
    try {
      if (!isValidEmail(email)) {
        setError("Please enter a valid email address.");
        return;
      }
      const failure = await requestPasswordReset(email.trim());
      if (failure) {
        setError(failure.message);
        return;
      }
      setSent(true);
    } finally {
      finish();
    }
  };

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 font-bold text-brand hover:underline">
      <ArrowLeft size={15} strokeWidth={2.4} aria-hidden />
      Back to Sign In
    </button>
  );

  if (sent) {
    return (
      <AuthShell title="Check your email" footer={back}>
        <div className="flex items-start gap-3 rounded-[14px] bg-brand-tint px-4 py-3.5">
          <MailCheck size={20} strokeWidth={2.2} aria-hidden className="mt-[1px] shrink-0 text-brand" />
          <p className="text-[14px] font-medium leading-[1.45] text-ink-soft">We sent you a password reset link.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={back}>
      <form onSubmit={submit} noValidate className="space-y-[18px]">
        <div>
          <label htmlFor="forgot-email" className={LABEL}>
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoFocus
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="uni@columbia.edu"
            className={cn(INPUT, "h-12")}
          />
        </div>
        <FormError message={error} />
        <button type="submit" disabled={pending} aria-busy={pending} className={cn(PRIMARY_BUTTON, "w-full")}>
          {pending && <Loader2 size={17} strokeWidth={2.6} className="animate-spin" aria-hidden />}
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
