import { Suspense } from "react";
import Link from "next/link";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { InspectSidebar } from "@/components/app-shell/inspect-sidebar";
import { buildSidebarItems } from "@/components/app-shell/sidebar-items";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";

export interface AppShellProps {
  /** Section label shown in the header (e.g. "Inspect", "Site"). */
  section: string;
  children: React.ReactNode;
}

/**
 * Shared sidebar + header chrome for the inspect and site routes. The
 * sidebar lists every cached page AND every sitemap URL (see
 * `buildSidebarItems`) so the user can hop between any page of the site.
 */
export function AppShell({ section, children }: AppShellProps) {
  const items = buildSidebarItems();

  return (
    <SidebarProvider>
      {/* useSearchParams in the sidebar requires a Suspense boundary for
          App Router static rendering. */}
      <Suspense fallback={null}>
        <InspectSidebar items={items} />
      </Suspense>
      <SidebarInset>
        <header className="border-border/40 bg-background/80 sticky top-0 z-10 flex h-12 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <nav className="flex items-center gap-3 text-xs">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Home
            </Link>
            <Link
              href="/site"
              className="text-muted-foreground hover:text-foreground"
              data-testid="nav-site"
            >
              Site
            </Link>
            <span className="text-muted-foreground/60 tracking-wider uppercase">{section}</span>
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-6 py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
