import { AppLayout } from "@/components/app/AppLayout";

// This layout wraps all /app/* routes.
// Sidebar and Topbar mount once and persist across route changes — no re-mount on navigation.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
