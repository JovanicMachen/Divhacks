"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Loader2, X } from "lucide-react";

import { useAccount, type AuthView } from "./AccountProvider";
import { cn } from "@/lib/utils";

export const INPUT =
  "w-full rounded-[12px] border border-line bg-field px-3.5 text-[14.5px] font-medium text-ink placeholder:font-normal placeholder:text-faint outline-none transition-[background-color,border-color,box-shadow] duration-150 focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10";
export const LABEL = "mb-[7px] block text-[13px] font-bold text-ink-soft";

/** Sign in / create account dialog, opened from the account control. */
export function AuthModal() {
  const { authView, closeAuth } = useAccount();
  return (
    <AnimatePresence>
      {authView && <AuthDialog key="auth" initialView={authView} onClose={closeAuth} />}
    </AnimatePresence>
  );
}

function AuthDialog({ initialView, onClose }: { initialView: AuthView; onClose: () => void }) {
  const { mode, signIn, signUp } = useAccount();
  const titleId = useId();
  const [view, setView] = useState(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isSignUp = view === "signUp";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const switchView = (next: AuthView) => {
    setView(next);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Passwords are at least 6 characters.");

    setBusy(true);
    if (isSignUp) {
      const result = await signUp(email.trim(), password, name);
      setBusy(false);
      if (result.error) return setError(result.error);
      if (result.notice) return setNotice(result.notice);
    } else {
      const message = await signIn(email.trim(), password);
      setBusy(false);
      if (message) return setError(message);
    }
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/30 p-3 backdrop-blur-[2px] tablet:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-[420px] overflow-hidden rounded-[20px] bg-panel shadow-[0_24px_60px_rgba(15,37,71,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6 tablet:px-7">
          <div>
            <h2 id={titleId} className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
              {isSignUp ? "Create your account" : "Sign in"}
            </h2>
            <p className="mt-[3px] text-[14px] font-medium text-muted">
              {isSignUp ? "Join Campus Connect at Columbia." : "Welcome back to Campus Connect."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-field text-ink transition-colors hover:bg-[#e6eaf2]"
          >
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>

        <div className="space-y-4 px-6 tablet:px-7">
          {isSignUp && (
            <div>
              <label htmlFor="auth-name" className={LABEL}>
                Display name
              </label>
              <input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="How your name appears"
                maxLength={50}
                className={cn(INPUT, "h-11")}
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className={LABEL}>
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="uni@columbia.edu"
              className={cn(INPUT, "h-11")}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className={LABEL}>
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder="At least 6 characters"
              className={cn(INPUT, "h-11")}
            />
          </div>

          {error && (
            <p role="alert" className="text-[13px] font-semibold text-coral-text">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-[11px] bg-brand-tint px-3 py-2.5 text-[13px] font-semibold text-brand">
              {notice}
            </p>
          )}
          {mode === "local" && (
            <p className="flex items-start gap-[7px] rounded-[11px] bg-[#F3F6FB] px-[11px] py-[9px] text-[12.5px] font-medium leading-[1.4] text-muted">
              <Info size={14} strokeWidth={2.3} aria-hidden className="mt-[1px] shrink-0 text-faint" />
              Local preview: Supabase isn&apos;t configured here, so your account and profile are kept in
              this browser only and passwords aren&apos;t checked.
            </p>
          )}
        </div>

        <div className="px-6 pb-6 pt-5 tablet:px-7">
          <motion.button
            type="submit"
            disabled={busy}
            whileHover={busy ? undefined : { y: -1 }}
            whileTap={busy ? undefined : { scale: 0.98, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-brand text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.26)] transition-colors hover:bg-brand-dark active:bg-brand-press disabled:cursor-wait disabled:opacity-80"
          >
            {busy && <Loader2 size={16} strokeWidth={2.6} className="animate-spin" aria-hidden />}
            {isSignUp ? "Create Account" : "Sign In"}
          </motion.button>
          <p className="mt-4 text-center text-[13.5px] font-medium text-muted">
            {isSignUp ? "Already have an account?" : "New to Campus Connect?"}{" "}
            <button
              type="button"
              onClick={() => switchView(isSignUp ? "signIn" : "signUp")}
              className="font-bold text-brand hover:underline"
            >
              {isSignUp ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </motion.form>
    </motion.div>
  );
}
