#!/usr/bin/env tsx
/**
 * Multi-tenant query audit. Greps the codebase for Prisma queries on
 * tenant-scoped models and fails if any lack a tenant filter.
 *
 * Run: npm run audit:tenancy
 *
 * This is a heuristic — it can't replace careful review — but it catches
 * the common "forgot the where clause" mistake. False positives can be
 * silenced with a `// tenancy-ok: <reason>` comment on the same or
 * preceding line.
 *
 * Add new tenant-scoped models to TENANT_MODELS below as the schema grows.
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

// Models with a direct or indirect restaurantId scope. Update as schema evolves.
const TENANT_MODELS = [
  "menuItem",
  "school",
  "deliveryDate",
  "order",
  "orderItem",
  "adminUser",
  "student",
  "parentChild",
  "deliveryMenuItem",
  "menuOption",
  "schoolMenuItem",
  "weeklyLunchPlan",
  "weeklyCheckoutBatch",
  "weeklyCheckoutBatchItem",
] as const;

const FINDERS = ["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"];

// Anything resembling a tenant filter is acceptable for the heuristic.
// (Real auditing should use AST parsing; this catches the obvious holes.)
const TENANT_FILTER_PATTERNS = [
  /restaurantId\s*:/, // direct
  /restaurant\s*:\s*\{[^}]*id\s*:/, // restaurant: { id: ... }
  /school\s*:\s*\{[^}]*restaurantId\s*:/, // school: { restaurantId: ... }
  /menuItem\s*:\s*\{[^}]*restaurantId\s*:/, // menuItem: { restaurantId: ... }
  /order\s*:\s*\{[^}]*restaurantId\s*:/, // order: { restaurantId: ... }
];

type Hit = {
  file: string;
  line: number;
  model: string;
  finder: string;
  snippet: string;
};

function gatherHits(): Hit[] {
  const hits: Hit[] = [];
  const pattern = TENANT_MODELS.map((m) => `prisma\\.${m}\\.(${FINDERS.join("|")})`).join("|");
  const cmd = `git ls-files "*.ts" "*.tsx" | xargs grep -nE "${pattern}" 2>/dev/null || true`;
  const output = execSync(cmd, { cwd: resolve(__dirname, ".."), encoding: "utf8" });

  for (const rawLine of output.split("\n")) {
    if (!rawLine.trim()) continue;
    const m = rawLine.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    const [, file, lineStr, snippet] = m;
    const line = parseInt(lineStr, 10);

    // Skip the audit script itself, schema, tests, generated code.
    if (
      file.includes("scripts/audit-tenant-scoping") ||
      file.includes("prisma/schema") ||
      file.includes(".test.") ||
      file.includes(".spec.") ||
      file.includes("node_modules/")
    ) continue;

    // Identify which model + finder hit. Take the first match.
    let model = "?";
    let finder = "?";
    for (const candidate of TENANT_MODELS) {
      const regex = new RegExp(`prisma\\.${candidate}\\.(${FINDERS.join("|")})`);
      const mm = snippet.match(regex);
      if (mm) {
        model = candidate;
        finder = mm[1];
        break;
      }
    }

    hits.push({ file, line, model, finder, snippet: snippet.trim() });
  }
  return hits;
}

function isScoped(file: string, hit: Hit): boolean {
  const content = readFileSync(resolve(__dirname, "..", file), "utf8");
  const lines = content.split("\n");

  // Inspect the call site's surrounding ~30 lines (single query usually fits)
  const start = Math.max(0, hit.line - 1);
  const end = Math.min(lines.length, hit.line + 30);
  const block = lines.slice(start, end).join("\n");

  // Bail if there's a tenancy-ok escape hatch
  for (let i = Math.max(0, hit.line - 2); i < Math.min(lines.length, hit.line + 1); i++) {
    if (lines[i].includes("tenancy-ok:")) return true;
  }

  // Find the closing paren of THIS call to bound our search.
  // Heuristic: take the block until we see the next prisma.X. or end.
  const callBlock = block.split(/\bprisma\./)[1] ?? block;

  return TENANT_FILTER_PATTERNS.some((p) => p.test(callBlock));
}

const hits = gatherHits();
const unscoped = hits.filter((h) => !isScoped(h.file, h));

if (unscoped.length === 0) {
  console.log(`✓ Audited ${hits.length} tenant-scoped Prisma queries — all properly scoped.`);
  process.exit(0);
}

console.error(`✗ Found ${unscoped.length} potentially unscoped tenant queries:\n`);
for (const h of unscoped) {
  console.error(`  ${h.file}:${h.line}  prisma.${h.model}.${h.finder}`);
  console.error(`    ${h.snippet}`);
  console.error(``);
}
console.error(
  `If a flagged call is intentionally cross-tenant, add a comment on the line above:`
);
console.error(`    // tenancy-ok: <reason — explain why scoping isn't needed here>`);
process.exit(1);
