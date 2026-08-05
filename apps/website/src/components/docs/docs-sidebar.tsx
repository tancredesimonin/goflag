"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

import type { DocsNavGroup } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

export function DocsSidebar({ groups }: { groups: DocsNavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="space-y-7 text-sm">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="text-muted-foreground mb-2 px-3 text-xs font-semibold tracking-wide uppercase">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              // A rule page (`/docs/rules/title.missing`) keeps the catalogue
              // entry highlighted, so the reader never loses their place.
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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
