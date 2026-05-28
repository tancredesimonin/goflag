import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFixtureServer, type FixtureServer } from "../fixture-server";
import { applyRuleConfig } from "@/lib/config";
import { lint } from "@/lib/core/lint";
import { inspect } from "@/lib/core/inspect";

/**
 * `headlint.config.ts` `rules: { "<id>": "off" }` must drop the rule's
 * issues from the pipeline the App Router server component uses —
 * proven by feeding the same `Page` through `lint` then `applyRuleConfig`.
 */
describe("config: rules toggle filters issues", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/tancrede"),
    });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("`rules: { '<id>': 'off' }` strips matching issues in-process", async () => {
    const page = await inspect(`${server.url}/fr`, { probes: false });
    const baseIssues = lint(page);
    const someRuleId = baseIssues.find((i) => i.severity !== "info")?.ruleId;
    expect(someRuleId, "fixture must produce at least one non-info issue").toBeTruthy();

    const filtered = applyRuleConfig(baseIssues, {
      rules: { [someRuleId!]: "off" },
    });
    expect(filtered.find((i) => i.ruleId === someRuleId)).toBeUndefined();
    expect(filtered.length).toBeLessThan(baseIssues.length);
  }, 30_000);
});
