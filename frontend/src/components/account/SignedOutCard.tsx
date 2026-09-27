"use client";

import { useAccount } from "./AccountProvider";
import { Avatar } from "./Avatar";

export function SignedOutCard({ title, body }: { title: string; body: string }) {
  const { openAuth } = useAccount();
  return (
    <div className="mx-auto w-full max-w-[460px] px-3 pt-10 tablet:pt-16">
      <div className="flex flex-col items-center rounded-[22px] border border-line bg-panel px-6 py-10 text-center shadow-[0_2px_8px_rgb(16_37_71_/_0.04)]">
        <Avatar size={72} />
        <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.02em] text-ink">{title}</h1>
        <p className="mt-1.5 text-[14.5px] font-medium text-muted">{body}</p>
        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={() => openAuth("signIn")}
            className="h-11 rounded-[12px] bg-brand px-6 text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.26)] transition-colors hover:bg-brand-dark"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => openAuth("signUp")}
            className="h-11 rounded-[12px] bg-field px-5 text-[15px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2]"
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}
