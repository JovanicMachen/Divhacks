"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Crown, Loader2 } from "lucide-react";

import { useAccount } from "@/components/account/AccountProvider";

/** Only for signed-out visitors; signed-in users are sent to the app. */
const AUTH_ROUTES = new Set(["/login", "/signup"]);
/** Reachable either way (the reset link signs the user in temporarily). */
const OPEN_ROUTES = new Set(["/reset-password"]);

export type RouteAccess = "auth" | "open" | "protected";

export function routeAccess(pathname: string): RouteAccess {
  if (AUTH_ROUTES.has(pathname)) return "auth";
  if (OPEN_ROUTES.has(pathname)) return "open";
  return "protected";
}

/** Only same-origin paths, so `?next=` can't bounce users off-site. */
export function safeNextPath(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && routeAccess(raw.split("?")[0]) === "protected"
    ? raw
    : "/";
}

/**
 * Entry layer around the app: every route except the auth pages needs a
 * session. Nothing protected renders until the session check has settled.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const access = routeAccess(pathname);
  // Expired reset links send people to /login?forgot=1, including if a session is still around.
  const forgotRequest =
    pathname === "/login" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("forgot") === "1";

  const redirect =
    access === "protected" && status === "signedOut"
      ? "login"
      : access === "auth" && status === "signedIn" && !forgotRequest
        ? "app"
        : null;

  useEffect(() => {
    if (redirect === "login") {
      const here = window.location.pathname + window.location.search;
      router.replace(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
    } else if (redirect === "app") {
      if (window.location.pathname === "/login" && new URLSearchParams(window.location.search).get("forgot") === "1") return;
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    }
  }, [redirect, router]);

  if (access !== "open" && (status === "loading" || redirect)) return <AuthSplash />;
  return <>{children}</>;
}

function AuthSplash() {
  return (
    <div aria-busy className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas">
      <span className="flex items-center gap-2.5">
        <Crown size={30} strokeWidth={1.6} aria-hidden className="fill-brand text-brand" />
        <span className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">Campus Connect</span>
      </span>
      <Loader2 size={22} strokeWidth={2.4} className="animate-spin text-faint" aria-label="Loading" />
    </div>
  );
}
