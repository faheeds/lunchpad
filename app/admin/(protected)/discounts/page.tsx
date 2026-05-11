/**
 * Discount Center — landing page for the admin. Shows every discount
 * the operator has set up, grouped by status (Active / Scheduled /
 * Expired / Drafts), with at-a-glance metrics on each.
 *
 * Design priorities:
 *  - Read-as-English: each row's description renders the discount as a
 *    short sentence ("10% off first order at any school") instead of
 *    config jargon. Same string the customer-facing receipt uses.
 *  - Empty state is generous and instructive — most operators discover
 *    this page mid-onboarding, so the first thing they should see when
 *    they have zero discounts is a clear "what is this?" + a CTA to
 *    create one from a template.
 *  - Stat tiles only when there's data; otherwise we'd be saying
 *    "0 of 0 of 0" which adds noise without info.
 *
 * Slice 1 ships read-only: the "Create discount" button links to a
 * not-yet-built template gallery that lands in slice 2.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { describeDiscount } from "@/lib/discount-describe";
import { DiscountTemplateBadge, type DiscountIconName } from "@/components/admin/discount-icons";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage() {
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const discounts = await prisma.discount.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  // Bucket by status. "Scheduled" = active but starts in the future.
  // "Expired" = past endsAt OR exhausted total redemption cap.
  // "Drafts" = isActive false (operator toggled off, not deleted).
  const now = new Date();
  const active: typeof discounts = [];
  const scheduled: typeof discounts = [];
  const expired: typeof discounts = [];
  const drafts: typeof discounts = [];
  for (const d of discounts) {
    if (!d.isActive) { drafts.push(d); continue; }
    const startsInFuture = d.startsAt && d.startsAt > now;
    const expiredByDate = d.endsAt && d.endsAt < now;
    const capReached = d.maxRedemptionsTotal !== null && d.currentRedemptions >= d.maxRedemptionsTotal;
    if (expiredByDate || capReached) { expired.push(d); continue; }
    if (startsInFuture) { scheduled.push(d); continue; }
    active.push(d);
  }

  // ── Topline stats ──────────────────────────────────────────────────────
  // Cheap aggregate query: sum redemption amounts across all this
  // tenant's discounts. Used for the "Savings given" tile.
  const lifetimeAgg = await prisma.discountRedemption.aggregate({
    where: { discount: { restaurantId: restaurant.id } },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  const lifetimeRedemptions = lifetimeAgg._count._all;
  const lifetimeSavings = lifetimeAgg._sum.amountCents ?? 0;

  const hasAnyDiscounts = discounts.length > 0;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-ink">Discounts</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Promo codes, automatic offers, and special deals for your customers.
          </p>
        </div>
        <Link
          href="/admin/discounts/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold no-underline hover:bg-brand-800 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create discount
        </Link>
      </div>

      {/* Stat tiles — only when we have at least one discount, otherwise
          we'd be displaying $0 of 0 across the board which is noise. */}
      {hasAnyDiscounts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatTile label="Active" value={active.length.toString()} hint={scheduled.length > 0 ? `+${scheduled.length} scheduled` : ""} />
          <StatTile label="Redemptions" value={lifetimeRedemptions.toLocaleString()} hint="lifetime" />
          <StatTile label="Savings given" value={fmtCurrency(lifetimeSavings)} hint="lifetime" />
          <StatTile label="Avg discount" value={lifetimeRedemptions > 0 ? fmtCurrency(Math.round(lifetimeSavings / lifetimeRedemptions)) : "—"} hint="per order" />
        </div>
      )}

      {/* Empty state */}
      {!hasAnyDiscounts && (
        <div className="rounded-[18px] border-2 border-dashed border-slate-200 bg-white p-8 text-center">
          <div className="flex justify-center mb-3">
            <DiscountTemplateBadge kind="WELCOME" size="lg" />
          </div>
          <h2 className="text-[15px] font-bold text-ink mb-1">No discounts yet</h2>
          <p className="text-[12px] text-slate-500 max-w-xs mx-auto mb-4 leading-relaxed">
            Set up a welcome offer for new families, a promo code for marketing campaigns,
            or an automatic sibling discount — all from one place.
          </p>
          <Link
            href="/admin/discounts/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold no-underline hover:bg-brand-800 transition"
          >
            Pick from a template →
          </Link>
        </div>
      )}

      {/* Buckets */}
      <DiscountBucket title="Active"    discounts={active}    badge={{ bg: "#dcfce7", color: "#15803d", label: "ACTIVE"    }} />
      <DiscountBucket title="Scheduled" discounts={scheduled} badge={{ bg: "#dbeafe", color: "#1e40af", label: "SCHEDULED" }} />
      <DiscountBucket title="Drafts"    discounts={drafts}    badge={{ bg: "#f1f5f9", color: "#475569", label: "DRAFT"     }} />
      <DiscountBucket title="Expired"   discounts={expired}   badge={{ bg: "#fee2e2", color: "#991b1b", label: "ENDED"     }} dim />

      {/* Stacking explainer — quiet, only when relevant */}
      {active.length > 1 && (
        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
            How discounts combine
          </p>
          <p className="text-[12px] text-slate-600 leading-relaxed">
            Only the single largest automatic discount applies per order. Customer-entered
            promo codes replace the auto-discount unless the code is marked as stackable.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-[20px] font-bold text-ink mt-1 leading-none">{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}

function DiscountBucket({
  title,
  discounts,
  badge,
  dim,
}: {
  title: string;
  discounts: Awaited<ReturnType<typeof loadBucket>>;
  badge: { bg: string; color: string; label: string };
  dim?: boolean;
}) {
  if (discounts.length === 0) return null;
  return (
    <section className="mb-5">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1">
        {title} <span className="text-slate-400 font-normal">· {discounts.length}</span>
      </h2>
      <div className="space-y-2">
        {discounts.map((d) => (
          <DiscountRow key={d.id} d={d} badge={badge} dim={dim} />
        ))}
      </div>
    </section>
  );
}

// Loose type alias so DiscountBucket can be re-used. The real shape is
// the Prisma Discount model.
async function loadBucket() { return prisma.discount.findMany(); }

function DiscountRow({
  d,
  badge,
  dim,
}: {
  d: Awaited<ReturnType<typeof loadBucket>>[number];
  badge: { bg: string; color: string; label: string };
  dim?: boolean;
}) {
  const sentence = describeDiscount(d);
  return (
    <Link
      href={`/admin/discounts/${d.id}`}
      className={`block rounded-xl border bg-white px-4 py-3 hover:border-brand-200 transition no-underline ${
        dim ? "opacity-60 border-slate-100" : "border-slate-100"
      }`}
    >
      <div className="flex items-start gap-3">
        <DiscountTemplateBadge kind={d.templateKind as DiscountIconName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-[14px] font-semibold text-ink">{d.name}</p>
            {d.code && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100">
                {d.code}
              </span>
            )}
          </div>
          <p className="text-[12px] text-slate-500 leading-snug">{sentence}</p>
          {d.currentRedemptions > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">
              {d.currentRedemptions} redemption{d.currentRedemptions === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <span
          className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 mt-1"
          style={{ background: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      </div>
    </Link>
  );
}

function fmtCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
