# AGENTS.md

## Cursor Cloud specific instructions

### Branch note

The runnable Next.js app lives on **`develop`**. The default **`main`** branch currently contains only planning docs (`README.md`, `PLAN.md`) — no `package.json`. Cloud agents should `git checkout develop` (or merge it) before `pnpm install` or any test/dev commands.

### Services (no Docker / databases)

| Service                      | Port | How to start                                                                      |
| ---------------------------- | ---- | --------------------------------------------------------------------------------- |
| Headlint (Next.js)           | 3000 | `pnpm dev` (dev) or `pnpm build && pnpm start` (prod-like)                        |
| Tancrede fixture HTTP (Hono) | 4322 | `HEADLINT_FIXTURE_PORT=4322 pnpm exec tsx test/e2e/fixture-launcher.ts`           |
| i18n fixture HTTP (Hono)     | 4323 | `HEADLINT_I18N_FIXTURE_PORT=4323 pnpm exec tsx test/e2e/i18n-fixture-launcher.ts` |

Playwright E2E starts all three automatically via `playwright.config.ts` `webServer`. For manual UI testing against fixtures, run the fixture server(s) before inspecting `http://127.0.0.1:4322/...` URLs.

### Toolchain

- Node `>=20.11` (see `.nvmrc`); repo pins **`pnpm@9.15.0`** via `packageManager` — use `corepack enable` and `corepack prepare pnpm@9.15.0 --activate`.
- First-time E2E on a fresh VM: `pnpm test:e2e:install` (Chromium + OS deps). Not part of the VM update script.

### Verify / test commands

Standard commands are in `package.json` and `README.md`. Typical full local check:

```sh
pnpm lint && pnpm typecheck
pnpm test:unit && pnpm test:component && pnpm test:integration
pnpm test:e2e    # builds app + boots fixture servers + runs Playwright
```

Integration tests use real Chromium for SPA fixtures; unit/component use Vitest + jsdom.

### Hello-world manual flow

1. Start fixture server (4322) and `pnpm dev` (3000).
2. Open `http://localhost:3000`, paste e.g. `http://127.0.0.1:4322/fr`, submit **Inspect**.
3. Confirm header (title + 200), then **Previews** and **Issues** tabs.

Optional `.env` from `.env.example` (shadcn studio keys, newsletter) — not required to run or test the app.
