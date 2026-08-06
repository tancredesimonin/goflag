"use client";

import { CheckIcon, LanguagesIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeLabel, locales, type Locale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/routing";

const localeFlags: Record<Locale, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
  es: "🇪🇸",
  "pt-br": "🇧🇷",
};

/** Always English — the button label must not follow the active locale. */
const CHANGE_LANGUAGE_LABEL = "Change language";

function LocaleSwitcherShell({ trigger }: { trigger: (disabled: boolean) => ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  function select(locale: Locale) {
    // `usePathname` returns the path with the locale segment stripped, so
    // switching is a matter of asking for the same path under another locale.
    startTransition(() => {
      router.replace(pathname, { locale });
    });
  }

  return (
    <DropdownMenu>
      {trigger(isPending)}
      <DropdownMenuContent align="end" className="min-w-44">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => select(locale)}
            className="flex items-center justify-between gap-2 whitespace-nowrap"
          >
            <span>
              {localeFlags[locale]} {localeLabel(locale)}
            </span>
            {locale === currentLocale ? <CheckIcon className="text-primary size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LocaleSwitcher({ label }: { label: string }) {
  return (
    <LocaleSwitcherShell
      trigger={(disabled) => (
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label} disabled={disabled}>
            <LanguagesIcon className="size-4.5" />
          </Button>
        </DropdownMenuTrigger>
      )}
    />
  );
}

/** Icon + fixed English label for the footer. */
export function LocaleSwitcherSelect() {
  return (
    <LocaleSwitcherShell
      trigger={(disabled) => (
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" disabled={disabled}>
            <LanguagesIcon className="size-4" />
            {CHANGE_LANGUAGE_LABEL}
          </Button>
        </DropdownMenuTrigger>
      )}
    />
  );
}
