import { Suspense } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { InspectSidebar, type InspectSidebarItem } from "@/components/app-shell/inspect-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { listCachedPages } from "@/lib/store/inspect-cache";

export default function InspectLayout({ children }: { children: React.ReactNode }) {
  const items: InspectSidebarItem[] = listCachedPages().map(({ url, page, storedAt }) => ({
    url,
    finalUrl: page.fetch.finalUrl,
    title: page.meta.title?.value ?? page.raw.title ?? new URL(url).pathname,
    locale: page.raw.htmlLang ?? "",
    storedAt,
    status: page.fetch.status,
    extractor: page.extractor.mode,
  }));

  return (
    <SidebarProvider>
      {/* useSearchParams in the sidebar is a Suspense boundary requirement
          for App Router static rendering; wrap explicitly. */}
      <Suspense fallback={null}>
        <InspectSidebar items={items} />
      </Suspense>
      <SidebarInset>
        <header className="border-border/40 bg-background/80 sticky top-0 z-10 flex h-12 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-muted-foreground text-xs tracking-wider uppercase">Inspect</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-6 py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
