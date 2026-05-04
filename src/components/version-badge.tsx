import { HEADLINT_VERSION, isPreAlpha } from "@/lib/version";

export interface VersionBadgeProps {
  version?: string;
}

export function VersionBadge({ version = HEADLINT_VERSION }: VersionBadgeProps) {
  const label = isPreAlpha(version) ? `pre-alpha · v${version}` : `v${version}`;
  return (
    <span
      data-testid="version-badge"
      className="text-muted-foreground inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs tracking-wider uppercase"
    >
      {label}
    </span>
  );
}
