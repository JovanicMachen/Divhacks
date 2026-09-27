"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Loader2, LogOut, Mail, PenLine, Settings } from "lucide-react";

import { useAccount } from "./AccountProvider";

export function SettingsView() {
  const { status, user, mode, signOut } = useAccount();
  const router = useRouter();
  if (status !== "signedIn") return null;

  return (
    <div className="mx-auto w-full max-w-[640px] px-3 pb-12 pt-4 tablet:px-6 tablet:pt-8">
      <h1 className="mb-4 text-[22px] font-extrabold tracking-[-0.02em] text-ink">Settings</h1>

      <div className="divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-panel">
        <div className="flex items-center gap-3.5 px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-tint text-brand">
            <Mail size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-muted">Signed in as</p>
            <p className="truncate text-[15px] font-bold text-ink">{user?.email}</p>
          </div>
        </div>
        <Link href="/profile/edit" className="flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-[#f7f9fc]">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-field text-ink-soft">
            <PenLine size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="flex-1 text-[15px] font-bold text-ink">Edit profile</span>
          <ChevronRight size={18} strokeWidth={2.2} aria-hidden className="text-faint" />
        </Link>
        <div className="flex items-center gap-3.5 px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-field text-ink-soft">
            <Settings size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <p className="text-[15px] font-bold text-ink">Notifications &amp; privacy</p>
            <p className="text-[13px] font-medium text-muted">More settings are on the way.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-[#f7f9fc]"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-coral-soft text-coral-text">
            <LogOut size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="text-[15px] font-bold text-coral-text">Sign Out</span>
        </button>
      </div>

      <OrganizationSection />

      {mode === "local" && (
        <p className="mt-4 text-center text-[12.5px] font-medium text-faint">
          Local preview — connect Supabase to keep accounts across devices.
        </p>
      )}
    </div>
  );
}

/** Temporary demo: the organization code is checked by the server, never in the browser. */
function OrganizationSection() {
  const { isOrg, displayName, becomeOrganization } = useAccount();
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const lock = useRef(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError(null);
    const failure = await becomeOrganization(code);
    lock.current = false;
    setWorking(false);
    if (failure) {
      setError(failure);
      return;
    }
    setCode("");
    setDone(true);
  };

  return (
    <section
      aria-labelledby="org-heading"
      className="mt-5 overflow-hidden rounded-[22px] border bg-panel px-5 py-5"
      style={{ borderColor: isOrg ? "#D9C6FB" : undefined }}
    >
      <div className="flex items-center gap-3.5">
        <span className="grid h-10 w-10 place-items-center rounded-full" style={{ backgroundColor: "#F1EAFE", color: "#6D28D9" }}>
          <Building2 size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="org-heading" className="text-[15px] font-bold text-ink">
            {isOrg ? "Organization account" : "Become an Organization"}
          </h2>
          <p className="text-[13px] font-medium text-muted">
            {isOrg
              ? `${displayName} posts Organization Events with a purple badge, and can mark events as paid.`
              : "Clubs and departments can post Organization Events. Enter the access code you were given."}
          </p>
        </div>
      </div>
      {isOrg ? (
        <p role={done ? "status" : undefined} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold" style={{ backgroundColor: "#F1EAFE", color: "#6D28D9" }}>
          <Building2 size={14} strokeWidth={2.5} aria-hidden />
          {done ? "You're now an organization" : "Organization"}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2 min-[420px]:flex-row">
          <label htmlFor="org-code" className="sr-only">
            Organization access code
          </label>
          <input
            id="org-code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Access code"
            maxLength={32}
            className="h-11 min-w-0 flex-1 rounded-[12px] border border-line bg-field px-3.5 text-[15px] font-semibold tracking-[0.2em] text-ink outline-none focus:border-[#7C3AED]/40 focus:bg-white focus:ring-4 focus:ring-[#7C3AED]/10"
          />
          <button
            type="submit"
            disabled={working || !code.trim()}
            className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] px-5 text-[15px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "#7C3AED" }}
          >
            {working && <Loader2 size={16} strokeWidth={2.6} aria-hidden className="animate-spin" />}
            {working ? "Checking…" : "Verify"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-coral-text">
          {error}
        </p>
      )}
    </section>
  );
}
