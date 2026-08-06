export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const PACKAGE_MANAGER_STORAGE_KEY = "goflag.package-manager";

export const DEFAULT_PACKAGE_MANAGER: PackageManager = "pnpm";

export function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}
