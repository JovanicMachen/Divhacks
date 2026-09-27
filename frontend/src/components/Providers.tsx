"use client";

import { AccountProvider } from "@/components/account/AccountProvider";
import { UserEventsProvider } from "@/lib/user-events";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <UserEventsProvider>{children}</UserEventsProvider>
    </AccountProvider>
  );
}
