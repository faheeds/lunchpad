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
  const repoRoot = resolve(__dirname, "..");

  // Cross-platform file enumeration. The previous implementation relied on
  // `git ls-files | xargs grep` which fails on Windows because `xargs`
  // isn't a native Windows command. Using `git ls-files` alone (which IS
  // cross-platform — git ships its own bundled tools on Windows) and
  // doing the regex match in Node makes this work everywhere.
  const fileList = execSync(`git ls-files "*.ts" "*.tsx"`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const files = fileList.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);

  const callRegex = new RegExp(
    `prisma\\.(${TENANT_MODELS.join("|")})\\.(${FINDERS.join("|")})`,
    "g",
  );

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(resolve(repoRoot, file), "utf8");
    } catch {
      continue; // file may be tracked but missing on disk
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((lineText, idx) => {
      callRegex.lastIndex = 0;
      const match = callRegex.exec(lineText);
      if (!match) return;
      // synthesize the same shape the old grep output produced
      processHit({
        file,
        line: idx + 1,
        snippet: lineText,
        hits,
      });
    });
  }

  return hits;
}

function processHit(args: {
  file: string;
  line: number;
  snippet: string;
  hits: Hit[];
}): void {
  const { file, line, snippet, hits } = args;

  // Skip the audit script itself, schema, tests, generated code.
  // Use a forward slash for the audit-script self-check so the comparison
  // works on Windows (git ls-files always returns forward slashes).
  if (
    file.includes("scripts/audit-tenant-scoping") ||
    file.includes("prisma/schema") ||
    file.includes(".test.") ||
    file.includes(".spec.") ||
    file.includes("node_modules/")
  ) return;

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
