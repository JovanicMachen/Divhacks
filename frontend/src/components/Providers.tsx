"use client";

import { AccountProvider } from "@/components/account/AccountProvider";
import { AuthGate } from "@/components/auth/AuthGate";
import { UserEventsProvider } from "@/lib/user-events";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <AuthGate>
        <UserEventsProvider>{children}</UserEventsProvider>
      </AuthGate>
    </AccountProvider>
  );
}
