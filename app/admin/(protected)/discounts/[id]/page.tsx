import type { Metadata } from "next";
/**
 * Discount edit / detail page.
 *
 * Loads the existing discount, seeds the builder with its current values,
 * and renders alongside it the lifecycle controls — toggle active, delete
 * — plus per-discount metrics so the operator can see how it's performed.
 *
 * Delete is gated server-side: any discount with redemptions can only be
 * deactivated so the audit trail on historic orders stays intact.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { templateForKind } from "@/lib/discount-templates";
import { describeDiscount } from "@/lib/discount-describe";
import { DiscountBuilder, type BuilderState } from "@/components/admin/discount-builder";
import { toggleDiscountActive, deleteDiscount } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit Discount",
};

export default async function DiscountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const discount = await prisma.discount.findFirst({
    where: { id, restaurantId: restaurant.id },
  });
  if (!discount) notFound();

  // Fallback to the CUSTOM template metadata if this discount predates
  // any template that's been removed. Should never happen in practice
  // but keeps the page from crashing on data drift.
  const template = templateForKind(discount.templateKind) ?? templateForKind("CUSTOM")!;

  const schools = await prisma.school.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true, name: true, category: true },
    orderBy: { name: "asc" },
  });

  const recentRedemptions = await prisma.discountRedemption.findMany({
    where: { discountId: id },
    include: {
      order: { select: { id: true, orderNumber: true, totalCents: true, parentName: true, paidAt: true } },
    },
    orderBy: { appliedAt: "desc" },
    take: 10,
  });

  const lifetimeSaved = await prisma.discountRedemption.aggregate({
    where: { discountId: id },
    _sum: { amountCents: true },
  });
  const totalSaved = lifetimeSaved._sum.amountCents ?? 0;

  const initial: BuilderState = {
    templateKind: discount.templateKind,
    name: discount.name,
    description: discount.description ?? "",
    code: discount.code ?? "",
    kind: discount.kind,
    valueDisplay: discount.kind === "PERCENT"
      ? String(discount.value)
      : (discount.value / 100).toFixed(discount.value % 100 === 0 ? 0 : 2),
    scope: discount.scope,
    itemIds: discount.itemIds,
    categories: discount.categories,
    minOrderDollars: discount.minOrderCents ? String(discount.minOrderCents / 100) : "",
    minItemCount: discount.minItemCount ? String(discount.minItemCount) : "",
    firstOrderOnly: discount.firstOrderOnly,
    schoolIds: discount.schoolIds,
    weekdays: discount.weekdays,
    startsAt: discount.startsAt ? toDateInput(discount.startsAt) : "",
    endsAt: discount.endsAt ? toDateInput(discount.endsAt) : "",
    maxRedemptionsTotal: discount.maxRedemptionsTotal ? String(discount.maxRedemptionsTotal) : "",
    maxRedemptionsPerUser: discount.maxRedemptionsPerUser ? String(discount.maxRedemptionsPerUser) : "",
    allowStackingWithCode: discount.allowStackingWithCode,
    isActive: discount.isActive,
  };

  const toggleAction = toggleDiscountActive.bind(null, id);
  const deleteAction = deleteDiscount.bind(null, id);

  return (
    <div className="min-h-screen bg-editorial-paper">
      <div className="max-w-3xl mx-auto pt-6 px-4">
        <Link
          href="/admin/discounts"
          className="text-[12px] text-editorial-ink-soft no-underline inline-flex items-center gap-1 hover:text-editorial-ink"
        >
          ← Discounts
        </Link>
      </div>

      <DiscountBuilder
        template={template}
        initial={initial}
        schools={schools}
        menuItems={menuItems}
        discountId={id}
      />

      {/* Per-discount stats + lifecycle controls */}
      <div className="max-w-3xl mx-auto px-4 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Stat label="Status" value={discount.isActive ? "Active" : "Inactive"} hint={describeDiscount(discount)} hintTruncate />
          <Stat label="Redemptions" value={String(discount.currentRedemptions)} hint={discount.maxRedemptionsTotal ? `of ${discount.maxRedemptionsTotal}` : "no cap"} />
          <Stat label="Saved by customers" value={fmt(totalSaved)} hint="lifetime" />
          <Stat label="Avg discount" value={discount.currentRedemptions > 0 ? fmt(Math.floor(totalSaved / discount.currentRedemptions)) : "—"} hint="per order" />
        </div>

        {/* Lifecycle controls */}
        <div className="rounded-[16px] border border-editorial-line bg-white p-4 mb-5 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">Status</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-editorial-ink-soft">
              {discount.isActive
                ? "Active — customers can apply this discount now."
                : "Inactive — no customer will see or be able to apply this discount."}
            </p>
            <form action={toggleAction}>
              <button
                type="submit"
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition ${
                  discount.isActive
                    ? "bg-editorial-paper-2 text-editorial-ink hover:bg-editorial-paper border border-editorial-line"
                    : "bg-editorial-sage text-editorial-green border border-editorial-line hover:border-editorial-green"
                }`}
              >
                {discount.isActive ? "Deactivate" : "Activate"}
              </button>
            </form>
          </div>
        </div>

        {/* Recent redemptions */}
        {recentRedemptions.length > 0 && (
          <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden mb-5 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
            <div className="px-4 py-2.5 border-b border-editorial-line">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-editorial-ink-faint">
                Recent redemptions
              </p>
            </div>
            <ul className="divide-y divide-editorial-line">
              {recentRedemptions.map((r) => (
                <li key={r.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orders/${r.order.id}`}
                      className="text-[13px] font-semibold text-editorial-ink no-underline hover:text-editorial-green"
                    >
                      {r.order.orderNumber}
                    </Link>
                    <p className="text-[11px] text-editorial-ink-soft truncate">
                      {r.order.parentName} · {r.order.paidAt ? new Date(r.order.paidAt).toLocaleDateString() : "pending"}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold text-editorial-green">
                    −{fmt(r.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Delete — separated visually, gated when redemptions exist */}
        <div className="rounded-[16px] border border-[#E2C3B3] bg-[#F4E3DB] p-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7C3D24] mb-2">Danger zone</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#6B5747]">
              {discount.currentRedemptions > 0
                ? "This discount has redemptions on historic orders — delete is disabled to keep that record intact. Deactivate instead."
                : "Permanently delete this discount. Cannot be undone."}
            </p>
            <form action={deleteAction}>
              <button
                type="submit"
                disabled={discount.currentRedemptions > 0}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold border border-[#E2C3B3] text-[#7C3D24] bg-white hover:bg-[#FAF6F3] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Stat({ label, value, hint, hintTruncate }: {
  label: string; value: string; hint?: string; hintTruncate?: boolean;
}) {
  return (
    <div className="rounded-[16px] border border-editorial-line bg-white p-3.5 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-editorial-ink-faint">{label}</p>
      <p className="text-[16px] font-bold text-editorial-ink mt-1 leading-none">{value}</p>
      {hint && (
        <p className={`text-[10px] text-editorial-ink-faint mt-1.5 ${hintTruncate ? "truncate" : ""}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function toDateInput(d: Date): string {
  // yyyy-MM-dd in the local timezone — the date input control expects this.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
