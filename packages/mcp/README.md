# @goflag/mcp

goflag as an MCP server. An agent audits the site it is editing — a dev server on `localhost`, a preview behind a VPN — and reads each rule with the documents that require it.

It runs locally, over stdio, on the same engine as [`@goflag/cli`](https://www.npmjs.com/package/@goflag/cli): an answer here is the answer `goflag` would print.

## Getting started

Claude Code:

```bash
claude mcp add goflag -- npx -y @goflag/mcp
```

Cursor (`.cursor/mcp.json`), VS Code (`.vscode/mcp.json`, under `servers`) and other clients take the same command:

```json
{
  "mcpServers": {
    "goflag": { "command": "npx", "args": ["-y", "@goflag/mcp"] }
  }
}
```

Then ask your agent to check the SEO of what it just changed: it starts the dev server, calls `audit_site` on its URL, fixes what is new, and calls it again.

## Tools

All four are read-only: none writes to disk or to the site.

| Tool                  | Input                                                                                                                       | Returns                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_site`          | `url`; optional `maxPages` (default 50), `locales`, `expectIndexing`, `static`, `advisories`, `checkExternal` (default off) | The findings rolled up by rule with their rigor, translation holes, broken links, the coverage, and the exit code the CLI would return |
| `compare_to_baseline` | the same, plus `baseline`: a JSON report saved by `goflag --report` or `--update-baseline`                                  | What is new, what was resolved, how many findings are unchanged                                                                        |
| `explain_rule`        | `id`, from a finding                                                                                                        | What the rule checks, why, its rigor, the documents behind it, and its page on goflag.tech                                             |
| `list_rules`          | optional `scope`: `page`, `site` or `prose`                                                                                 | Every rule with its scope, severity and rigor                                                                                          |

`audit_site` reports crawl progress to a client that asks for it, and stops when the call is cancelled.

## What it does not do

- **No header as a tool argument.** A token passed there would sit in the agent's transcript. A protected preview is configured instead — see below.
- **No command to run.** The agent starts its own dev server; this server never executes one.
- **No baseline written.** Capture one with `goflag <url> --update-baseline --baseline .goflag/baseline.json`; `compare_to_baseline` only reads it, and refuses a file that is not a goflag report without quoting it.
- **No remote mode.** It runs where the agent runs — which is why it can see `localhost`.

## A protected preview

Give the server the header and the origin it is for, in its environment:

```bash
claude mcp add goflag \
  -e GOFLAG_HEADERS="x-vercel-protection-bypass: <secret>" \
  -e GOFLAG_HEADERS_ORIGIN=https://my-app-git-main-my-team.vercel.app \
  -- npx -y @goflag/mcp
```

`GOFLAG_HEADERS` holds one `Name: value` per line; `GOFLAG_HEADERS_ORIGIN` the origins they are for, comma-separated. They are sent to those origins only, whatever URL the agent audits, and a value never appears in a result. A configuration the server cannot honour stops it from starting. [More on goflag.tech](https://goflag.tech/docs/mcp#a-protected-preview).

## Requirements

Node 22 or later. A page that renders in the browser is audited in Chromium, through the `playwright` package; without it, or with `static: true`, the server-rendered HTML is judged instead.

## Learn more

- [The rules](https://goflag.tech/docs/rules) — each with its rigor and its sources
- [The CLI](https://www.npmjs.com/package/@goflag/cli) — the gate in CI, the HTML report, `--header`
- [Source and issues](https://github.com/tancredesimonin/goflag)
