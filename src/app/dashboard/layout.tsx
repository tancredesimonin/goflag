import { AppShell } from "@/components/app-shell/app-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell section="Dashboard">{children}</AppShell>;
}
