import { AppShell } from "@/components/app-shell/app-shell";

export default function InspectLayout({ children }: { children: React.ReactNode }) {
  return <AppShell section="Inspect">{children}</AppShell>;
}
