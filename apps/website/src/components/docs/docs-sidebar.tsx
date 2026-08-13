"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

import { activeDocsHref, type DocsNavGroup } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

export function DocsSidebar({ groups }: { groups: DocsNavGroup[] }) {
  const pathname = usePathname();
  // Computed once across every group, not per item: "is this the closest entry
  // to where I am?" is a question about the whole sidebar, and asking it per
  // item is what let a parent and its child both answer yes.
  const current = activeDocsHref(
    pathname,
    groups.flatMap((group) => group.items.map((item) => item.href)),
  );

  return (
    <nav aria-label="Documentation" className="space-y-7 text-sm">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="text-muted-foreground mb-2 px-3 text-xs font-semibold tracking-wide uppercase">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === current;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-1.5 transition-colors",
                      active
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
