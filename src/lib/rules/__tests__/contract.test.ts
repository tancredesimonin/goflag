/**
 * Per-rule contract tests.
 *
 * One harness, one fixture pair per rule. For each rule we:
 *
 *   1. Assert `fixtures/rules/<id>/pass.html` exists and produces zero
 *      issues *for that rule* when piped through `lint()`. (Other rules
 *      may legitimately fire on the same HTML; we only care about the
 *      rule under test.)
 *   2. Assert `fixtures/rules/<id>/fail.html` exists and produces at
 *      least one issue from the rule under test, with the right
 *      severity and a non-empty message.
 *
 * Adding a new rule without both fixture files surfaces here as a
 * failed test — that's the Phase 5.11 gate. No separate CI script is
 * needed; this file is the gate.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { lint } from "@/lib/core/lint";
import { RULES } from "@/lib/rules";
import { pageFromHtml } from "@/lib/rules/test-utils";

const FIXTURES_ROOT = resolve(__dirname, "../../../../fixtures/rules");

describe("rule contract", () => {
  for (const rule of RULES) {
    describe(rule.id, () => {
      const passPath = resolve(FIXTURES_ROOT, rule.id, "pass.html");
      const failPath = resolve(FIXTURES_ROOT, rule.id, "fail.html");

      it("ships a pass.html fixture", () => {
        expect(
          existsSync(passPath),
          `Missing fixtures/rules/${rule.id}/pass.html — every rule must ship a passing fixture.`,
        ).toBe(true);
      });

      it("ships a fail.html fixture", () => {
        expect(
          existsSync(failPath),
          `Missing fixtures/rules/${rule.id}/fail.html — every rule must ship a failing fixture.`,
        ).toBe(true);
      });

      it("does not fire on pass.html", () => {
        if (!existsSync(passPath)) return;
        const html = readFileSync(passPath, "utf8");
        const headers = rule.id === "robots.conflict" ? { "x-robots-tag": "index" } : undefined;
        const page = pageFromHtml(html, { headers });
        const issues = lint(page).filter((i) => i.ruleId === rule.id);
        expect(
          issues,
          `Expected no \`${rule.id}\` issues on pass.html, got ${JSON.stringify(issues)}`,
        ).toEqual([]);
      });

      it("fires on fail.html with the right shape", () => {
        if (!existsSync(failPath)) return;
        const html = readFileSync(failPath, "utf8");
        const headers =
          rule.id === "robots.conflict" ? { "x-robots-tag": "index, follow" } : undefined;
        const page = pageFromHtml(html, { headers });
        const issues = lint(page).filter((i) => i.ruleId === rule.id);
        expect(
          issues.length,
          `Expected at least one \`${rule.id}\` issue on fail.html, got none.`,
        ).toBeGreaterThan(0);
        for (const issue of issues) {
          expect(issue.severity).toBe(rule.severity);
          expect(issue.message.length).toBeGreaterThan(0);
          expect(issue.docs).toBe(`/rules/${rule.id}`);
        }
      });
    });
  }
});
