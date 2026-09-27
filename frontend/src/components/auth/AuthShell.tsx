"use client";

import { Crown, Info } from "lucide-react";

import { useAccount } from "@/components/account/AccountProvider";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Rendered under the card, e.g. the switch between sign in and sign up. */
  footer?: React.ReactNode;
}

/** Branded, centred card used by the sign-in, sign-up, and reset pages. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const { mode } = useAccount();
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 tablet:py-16">
        <div className="flex flex-col items-center text-center">
          <span className="flex items-center gap-2.5">
            <Crown size={34} strokeWidth={1.6} aria-hidden className="fill-brand text-brand" />
            <span className="text-[27px] font-extrabold tracking-[-0.02em] text-ink">Campus Connect</span>
          </span>
          <span className="mt-1 text-[14px] font-medium text-muted">Columbia University</span>
        </div>

        <section
          aria-labelledby="auth-title"
          className="mt-7 w-full max-w-[420px] rounded-[22px] border border-line bg-panel px-5 py-7 shadow-float tablet:px-8 tablet:py-8"
        >
          <h1 id="auth-title" className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-[14.5px] font-medium text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {mode === "local" && (
            <p className="mt-5 flex items-start gap-[7px] rounded-[11px] bg-[#F3F6FB] px-[11px] py-[9px] text-[12.5px] font-medium leading-[1.4] text-muted">
              <Info size={14} strokeWidth={2.3} aria-hidden className="mt-[1px] shrink-0 text-faint" />
              Local preview: Supabase isn&apos;t configured here, so accounts are kept in this browser
              only and passwords aren&apos;t checked.
            </p>
          )}
        </section>

        {footer && <div className="mt-5 text-center text-[14px] font-medium text-muted">{footer}</div>}
      </main>
      <p className="pb-6 text-center text-[12.5px] font-medium text-faint">
        See what&apos;s happening around campus, right now.
      </p>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[12px] bg-coral-soft px-3.5 py-2.5 text-[13.5px] font-semibold text-coral-text">
      {message}
    </p>
  );
}

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-[6px] text-[12.5px] font-semibold text-coral-text">
      {message}
    </p>
  );
}
