"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/** Always English — the button label must not follow the active locale. */
const TOGGLE_THEME_LABEL = "Toggle theme";

export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="size-4.5 dark:hidden" />
      <MoonIcon className="hidden size-4.5 dark:block" />
    </Button>
  );
}

/** Icon + fixed English label for the footer. */
export function ThemeToggleSelect() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      aria-label={TOGGLE_THEME_LABEL}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="size-4 dark:hidden" />
      <MoonIcon className="hidden size-4 dark:block" />
      {TOGGLE_THEME_LABEL}
    </Button>
  );
}
