/**
 * Smoke test for production / staging deployments.
 *
 * Runs a tight sequence of GET requests against the customer + admin
 * routes of a target host and asserts each one returns the expected
 * shape. Designed to be runnable from a CI step or your laptop after
 * a deploy:
 *
 *     npx tsx scripts/smoke-test.ts                              # apex
 *     SMOKE_HOST=fsskitchen.lunchpad.us npx tsx scripts/smoke-test.ts
 *     npx tsx scripts/smoke-test.ts https://staging.lunchpad.us
 *
 * Exit code 0 = all green; non-zero = something failed.
 *
 * Intentionally LIGHT — no real auth, no Stripe, no order placement.
 * This is "is the production deployment alive and serving the right
 * marketing/ordering surfaces?" If you want a true E2E (signup →
 * order → Stripe → refund), build that as a Playwright suite.
 */

const DEFAULT_HOST = "https://lunchpad.us";
const DEFAULT_TENANT_HOST = process.env.SMOKE_HOST ?? "fsskitchen.lunchpad.us";

interface Check {
  name: string;
  url: string;
  /** Lowercased substring that must appear in the body, or a status assertion. */
  expect: { status?: number; bodyIncludes?: string[]; bodyExcludes?: string[] };
}

function buildChecks(apex: string, tenantHost: string): Check[] {
  return [
    // ── Platform marketing page ─────────────────────────────────────
    {
      name: "Apex landing page loads",
      url: `${apex}/`,
      expect: {
        status: 200,
        bodyIncludes: ["lunchpad", "start free trial", "pricing"],
        // Sanity: a tenant slug should NOT show up on the apex page;
        // if it does, the platform-vs-tenant routing has regressed.
        bodyExcludes: ["fsskitchen", "order single day"],
      },
    },
    {
      name: "Signup page loads",
      url: `${apex}/signup`,
      expect: {
        status: 200,
        bodyIncludes: ["start your 14-day free trial", "restaurant name"],
      },
    },
    {
      name: "Admin login page loads",
      url: `${apex}/admin/login`,
      expect: { status: 200, bodyIncludes: ["sign in"] },
    },

    // ── Tenant ordering surface ────────────────────────────────────
    {
      name: `Tenant ordering page loads (${tenantHost})`,
      url: `https://${tenantHost}/`,
      expect: {
        status: 200,
        bodyIncludes: ["order"],
        // Should NOT show the platform pricing — that would mean
        // tenant routing broke and we're serving the marketing site
        // on a subdomain.
        bodyExcludes: ["start free trial", "most popular"],
      },
    },
    {
      name: `Tenant /menu loads`,
      url: `https://${tenantHost}/menu`,
      expect: { status: 200 },
    },

    // ── Mobile-app API surface ─────────────────────────────────────
    {
      name: "Mobile native /info endpoint responds",
      url: `https://${tenantHost}/api/mobile/native/info`,
      expect: {
        status: 200,
        bodyIncludes: ["name", "slug"],
      },
    },
  ];
}

// ─── Runner ─────────────────────────────────────────────────────────────

async function runCheck(c: Check): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(c.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (c.expect.status && res.status !== c.expect.status) {
      return { ok: false, reason: `HTTP ${res.status} (wanted ${c.expect.status})` };
    }
    const body = (await res.text()).toLowerCase();
    for (const needle of c.expect.bodyIncludes ?? []) {
      if (!body.includes(needle.toLowerCase())) {
        return { ok: false, reason: `body missing: "${needle}"` };
      }
    }
    for (const needle of c.expect.bodyExcludes ?? []) {
      if (body.includes(needle.toLowerCase())) {
        return { ok: false, reason: `body unexpectedly contains: "${needle}"` };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "fetch failed" };
  }
}

async function main() {
  const apex = process.argv[2] ?? DEFAULT_HOST;
  const tenant = DEFAULT_TENANT_HOST;
  const checks = buildChecks(apex, tenant);

  console.log(`Smoke testing ${apex} (tenant: ${tenant})\n`);
  let failed = 0;
  for (const c of checks) {
    process.stdout.write(`  ${c.name.padEnd(50, ".")} `);
    const result = await runCheck(c);
    if (result.ok) {
      console.log("OK");
    } else {
      console.log(`FAIL — ${result.reason}`);
      failed++;
    }
  }
  console.log("");
  if (failed === 0) {
    console.log(`All ${checks.length} checks passed.`);
  } else {
    console.log(`${failed} of ${checks.length} checks failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
