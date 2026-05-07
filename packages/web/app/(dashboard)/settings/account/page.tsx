// Legacy URL — redirects to /settings (kept so the avatar link in
// AppShell continues to work without a refactor).

import { redirect } from "next/navigation";

export default function AccountSettingsRedirect() {
  redirect("/settings");
}
