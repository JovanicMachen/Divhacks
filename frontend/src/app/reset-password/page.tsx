import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset password — Campus Connect" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
