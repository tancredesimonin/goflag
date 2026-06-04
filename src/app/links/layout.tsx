import { AppShell } from "@/components/app-shell/app-shell";

export default function LinksLayout({ children }: { children: React.ReactNode }) {
  return <AppShell section="Links">{children}</AppShell>;
}
