"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_PACKAGE_MANAGER,
  isPackageManager,
  PACKAGE_MANAGER_STORAGE_KEY,
  PACKAGE_MANAGERS,
  type PackageManager,
} from "@/lib/package-manager";
import { cn } from "@/lib/utils";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PACKAGE_MANAGER_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readStored(): PackageManager {
  try {
    const value = window.localStorage.getItem(PACKAGE_MANAGER_STORAGE_KEY);
    if (value && isPackageManager(value)) return value;
  } catch {
    // private mode / blocked storage — fall through
  }
  return DEFAULT_PACKAGE_MANAGER;
}

function getServerSnapshot(): PackageManager {
  return DEFAULT_PACKAGE_MANAGER;
}

function usePackageManager(): [PackageManager, (next: PackageManager) => void] {
  const manager = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  function setManager(next: PackageManager) {
    try {
      window.localStorage.setItem(PACKAGE_MANAGER_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    emit();
  }

  return [manager, setManager];
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy"}
      className="text-muted-foreground hover:text-foreground absolute top-2 right-2 size-8"
    >
      {copied ? (
        <CheckIcon className="text-flag-green size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  );
}

export type PackageManagerCodeProps = {
  pnpm?: string;
  npm?: string;
  yarn?: string;
  bun?: string;
  className?: string;
};

/**
 * A fenced-code lookalike with a package-manager switch. The selection is
 * shared across every instance on the site via `localStorage`, so picking
 * yarn once keeps yarn on the Chromium snippet further down the page.
 */
export function PackageManagerCode({ pnpm, npm, yarn, bun, className }: PackageManagerCodeProps) {
  const commands: Partial<Record<PackageManager, string>> = { pnpm, npm, yarn, bun };
  const available = PACKAGE_MANAGERS.filter((manager) => Boolean(commands[manager]));
  const [stored, setStored] = usePackageManager();
  const active = available.includes(stored) ? stored : (available[0] ?? DEFAULT_PACKAGE_MANAGER);

  if (available.length === 0) return null;

  return (
    <div
      className={cn(
        "border-border bg-muted my-6 overflow-hidden rounded-lg border not-prose",
        className,
      )}
    >
      <Tabs
        value={active}
        onValueChange={(value) => {
          if (isPackageManager(value)) setStored(value);
        }}
        className="gap-0"
      >
        <TabsList
          variant="line"
          className="border-border h-10 w-full justify-start rounded-none border-b bg-transparent px-1"
        >
          {available.map((manager) => (
            <TabsTrigger
              key={manager}
              value={manager}
              className="rounded-none px-3 font-mono text-xs data-active:bg-transparent"
            >
              {manager}
            </TabsTrigger>
          ))}
        </TabsList>
        {available.map((manager) => {
          const code = commands[manager]!;
          return (
            <TabsContent key={manager} value={manager} className="mt-0">
              <div className="relative">
                <CopyButton code={code} />
                <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed">
                  <code>
                    {code.split("\n").map((line, index) => (
                      <span key={index} className="block">
                        {line || "\n"}
                      </span>
                    ))}
                  </code>
                </pre>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
