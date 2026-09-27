import type { Metadata } from "next";

import { SettingsView } from "@/components/account/SettingsView";
import { PageShell } from "@/components/layout/PageShell";

export const metadata: Metadata = { title: "Settings — Campus Connect" };

export default function SettingsPage() {
  return (
    <PageShell>
      <SettingsView />
    </PageShell>
  );
}
