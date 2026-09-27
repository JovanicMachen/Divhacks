import { Suspense } from "react";
import type { Metadata } from "next";

import { ProfileView } from "@/components/account/ProfileView";
import { PageShell } from "@/components/layout/PageShell";

export const metadata: Metadata = { title: "Your profile — Campus Connect" };

export default function ProfilePage() {
  return (
    <PageShell>
      <Suspense>
        <ProfileView />
      </Suspense>
    </PageShell>
  );
}
