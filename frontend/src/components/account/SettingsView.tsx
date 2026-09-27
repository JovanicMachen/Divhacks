"use client";

import Link from "next/link";
import { ChevronRight, LogOut, Mail, PenLine, Settings } from "lucide-react";

import { useAccount } from "./AccountProvider";
import { SignedOutCard } from "./SignedOutCard";

export function SettingsView() {
  const { status, user, mode, signOut } = useAccount();
  if (status === "loading") return null;
  if (status === "signedOut")
    return <SignedOutCard title="Sign in to manage settings" body="Account settings are available once you're signed in." />;

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
          onClick={() => signOut()}
          className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-[#f7f9fc]"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-coral-soft text-coral-text">
            <LogOut size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="text-[15px] font-bold text-coral-text">Sign Out</span>
        </button>
      </div>

      {mode === "local" && (
        <p className="mt-4 text-center text-[12.5px] font-medium text-faint">
          Local preview — connect Supabase to keep accounts across devices.
        </p>
      )}
    </div>
  );
}
