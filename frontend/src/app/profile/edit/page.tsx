import type { Metadata } from "next";

import { ProfileEditForm } from "@/components/account/ProfileEditForm";
import { PageShell } from "@/components/layout/PageShell";

export const metadata: Metadata = { title: "Edit profile — Campus Connect" };

export default function EditProfilePage() {
  return (
    <PageShell>
      <ProfileEditForm />
    </PageShell>
  );
}
