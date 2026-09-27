"use client";

import { AccountProvider } from "@/components/account/AccountProvider";
import { AuthGate } from "@/components/auth/AuthGate";
import { NotificationsProvider } from "@/lib/notifications";
import { UserEventsProvider } from "@/lib/user-events";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <AuthGate>
        <UserEventsProvider>
          <NotificationsProvider>{children}</NotificationsProvider>
        </UserEventsProvider>
      </AuthGate>
    </AccountProvider>
  );
}
