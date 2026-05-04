/**
 * JSON-LD validator.
 *
 * Walks one `JsonLdBlock` (already parsed by `extract/json-ld.ts`) and
 * yields `JsonLdValidationIssue`s describing every problem the rules
 * registry in `./schema.ts` knows how to catch. The validator is
 * pure and synchronous — same contract as the Phase 5 rule engine —
 * so it can run in the CLI, the inspect server component, and a
 * future hosted SaaS without surprises.
 *
 * Scope of v1 (Phase 6):
 *
 *   - Parse-error and missing-`@context` checks at the block level.
 *   - For each entity (top-level, plus every `@graph` member), look up
 *     the type in `SCHEMAS`. Unknown types produce an `info` "we
 *     don't validate this type yet" finding rather than silently
 *     passing.
 *   - For every required field: presence + kind. For every recommended
 *     field: presence as a `warning`. Kind checks: `string`, `url`
 *     (parses as absolute http(s)), `iso-date` (`Date.parse` finite
 *     and recognisable shape), `array` (with optional non-empty +
 *     item-kind), `object`, `any`.
 *
 * Out of scope (deferred): cross-entity constraints (e.g.
 * `BreadcrumbList.position` strictly increasing), full RDFa coercion,
 * `@reverse` properties, `@id` resolution.
 */

import type { JsonLdBlock } from "@/lib/core/types";
import { getSchema, type FieldKind, KNOWN_TYPES, type SchemaField } from "./schema";
import type { JsonLdValidationIssue, JsonLdValidationCode } from "./types";

interface Ctx {
  blockIndex: number;
  out: JsonLdValidationIssue[];
}

export function validateJsonLdBlock(block: JsonLdBlock): JsonLdValidationIssue[] {
  const ctx: Ctx = { blockIndex: block.index, out: [] };

  if (block.parseError) {
    ctx.out.push(
      issue(ctx, "", "error", "parse-error", `JSON-LD failed to parse: ${block.parseError}`),
    );
    return ctx.out;
  }
  if (block.data === null || block.data === undefined) {
    return ctx.out;
  }

  const root = block.data;
  if (typeof root !== "object" || root === null) {
    ctx.out.push(issue(ctx, "", "error", "expected-object", "JSON-LD root must be an object."));
    return ctx.out;
  }

  // Block-level checks: missing @context.
  if (!Array.isArray(root) && !("@context" in (root as Record<string, unknown>))) {
    ctx.out.push(
      issue(
        ctx,
        "",
        "warning",
        "missing-context",
        "Block has no `@context` — many consumers default to schema.org but Google warns about this.",
      ),
    );
  }

  walk(root, "", ctx);
  return ctx.out;
}

/** Convenience: validate every block on a page in one call, sorted by block index. */
export function validateAllJsonLd(blocks: JsonLdBlock[]): JsonLdValidationIssue[] {
  return blocks
    .flatMap((b) => validateJsonLdBlock(b))
    .sort((a, b) => a.blockIndex - b.blockIndex || a.path.localeCompare(b.path));
}

function walk(value: unknown, path: string, ctx: Ctx): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, ctx));
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;

  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    graph.forEach((item, i) => walk(item, joinPath(path, `@graph[${i}]`), ctx));
  }

  const types = readType(obj);
  if (types.length === 0) {
    // An object that *isn't* the @graph wrapper and *isn't* the
    // top-level @context-only doc deserves a missing-type finding.
    if (path !== "" || !graph) {
      ctx.out.push(issue(ctx, path, "warning", "missing-type", "Entity has no `@type`."));
    }
    return;
  }

  for (const type of types) {
    validateType(obj, path, type, ctx);
  }
}

function validateType(obj: Record<string, unknown>, path: string, type: string, ctx: Ctx): void {
  const schema = getSchema(type);
  if (!schema) {
    if (!KNOWN_TYPES.has(type)) {
      ctx.out.push(
        issue(
          ctx,
          path,
          "info",
          "unknown-type",
          `Headlint does not yet validate \`${type}\` — block is preserved as-is.`,
          type,
        ),
      );
    }
    return;
  }

  for (const field of schema.required) {
    checkField(obj, path, type, field, "required", ctx);
  }
  for (const field of schema.recommended) {
    checkField(obj, path, type, field, "recommended", ctx);
  }
}

function checkField(
  obj: Record<string, unknown>,
  path: string,
  type: string,
  field: SchemaField,
  level: "required" | "recommended",
  ctx: Ctx,
): void {
  const value = obj[field.name];
  if (value === undefined || value === null || value === "") {
    if (level === "required") {
      ctx.out.push(
        issue(
          ctx,
          joinPath(path, field.name),
          "error",
          "missing-required",
          `\`${type}\` is missing required \`${field.name}\`.`,
          type,
        ),
      );
    } else {
      ctx.out.push(
        issue(
          ctx,
          joinPath(path, field.name),
          "warning",
          "missing-required",
          `\`${type}\` is missing recommended \`${field.name}\`.`,
          type,
        ),
      );
    }
    return;
  }
  validateKind(value, joinPath(path, field.name), type, field, ctx);
}

function validateKind(
  value: unknown,
  path: string,
  type: string,
  field: SchemaField,
  ctx: Ctx,
): void {
  switch (field.kind) {
    case "any":
      return;
    case "string":
      if (typeof value !== "string") {
        ctx.out.push(
          issue(ctx, path, "error", "expected-string", `\`${field.name}\` must be a string.`, type),
        );
      }
      return;
    case "url":
      if (typeof value !== "string" || !isAbsoluteUrl(value)) {
        ctx.out.push(
          issue(
            ctx,
            path,
            "error",
            "expected-url",
            `\`${field.name}\` must be an absolute http(s) URL.`,
            type,
          ),
        );
      }
      return;
    case "iso-date":
      if (typeof value !== "string" || !isIsoDate(value)) {
        ctx.out.push(
          issue(
            ctx,
            path,
            "error",
            "expected-iso-date",
            `\`${field.name}\` must be an ISO 8601 date string.`,
            type,
          ),
        );
      }
      return;
    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        ctx.out.push(
          issue(
            ctx,
            path,
            "error",
            "expected-object",
            `\`${field.name}\` must be an object.`,
            type,
          ),
        );
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        ctx.out.push(
          issue(ctx, path, "error", "expected-array", `\`${field.name}\` must be an array.`, type),
        );
        return;
      }
      if (field.nonEmpty && value.length === 0) {
        ctx.out.push(
          issue(ctx, path, "error", "empty-array", `\`${field.name}\` must not be empty.`, type),
        );
      }
      if (field.items) {
        value.forEach((item, i) =>
          validateKind(
            item,
            `${path}[${i}]`,
            type,
            { name: field.name, kind: field.items as FieldKind },
            ctx,
          ),
        );
      }
      return;
  }
}

function readType(obj: Record<string, unknown>): string[] {
  const t = obj["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string");
  return [];
}

function isAbsoluteUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(v: string): boolean {
  // Accept the most common forms: YYYY-MM-DD, full datetime with
  // optional timezone. We test both shape and `Date.parse` validity to
  // avoid false positives on `"2026-13-40"` (which `Date.parse` would
  // happily turn into a real date in some engines).
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
    return false;
  }
  return Number.isFinite(Date.parse(v));
}

function joinPath(parent: string, child: string): string {
  if (!parent) return child;
  if (child.startsWith("[")) return `${parent}${child}`;
  return `${parent}.${child}`;
}

function issue(
  ctx: Ctx,
  path: string,
  severity: "error" | "warning" | "info",
  code: JsonLdValidationCode,
  message: string,
  type?: string,
): JsonLdValidationIssue {
  return { blockIndex: ctx.blockIndex, path, severity, code, message, type };
}
