import { AppShell } from "@/components/app-shell/app-shell";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <AppShell section="Site">{children}</AppShell>;
}
