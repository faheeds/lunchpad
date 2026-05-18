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

import type { Metadata } from "next";
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
  title: "Edit Discount | LunchPad Admin",
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
    <div>
      <div className="max-w-3xl mx-auto pt-6 px-4">
        <Link
          href="/admin/discounts"
          className="text-[12px] text-slate-500 no-underline inline-flex items-center gap-1 hover:text-ink"
        >
          ← Discounts
        </Link>
      </div>

      <DiscountBuilder
        template={template}
        initial={initial}
        schools={schools}
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
        <div className="rounded-2xl border border-slate-100 bg-white p-4 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Status</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-slate-600">
              {discount.isActive
                ? "Active — customers can apply this discount now."
                : "Inactive — no customer will see or be able to apply this discount."}
            </p>
            <form action={toggleAction}>
              <button
                type="submit"
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition ${
                  discount.isActive
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-brand-50 text-brand-800 border border-brand-200 hover:bg-brand-100"
                }`}
              >
                {discount.isActive ? "Deactivate" : "Activate"}
              </button>
            </form>
          </div>
        </div>

        {/* Recent redemptions */}
        {recentRedemptions.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden mb-5">
            <div className="px-4 py-2.5 border-b border-slate-50">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Recent redemptions
              </p>
            </div>
            <ul className="divide-y divide-slate-50">
              {recentRedemptions.map((r) => (
                <li key={r.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orders/${r.order.id}`}
                      className="text-[13px] font-semibold text-ink no-underline hover:text-brand-700"
                    >
                      {r.order.orderNumber}
                    </Link>
                    <p className="text-[11px] text-slate-500 truncate">
                      {r.order.parentName} · {r.order.paidAt ? new Date(r.order.paidAt).toLocaleDateString() : "pending"}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold text-green-700">
                    −{fmt(r.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Delete — separated visually, gated when redemptions exist */}
        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 mb-2">Danger zone</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-slate-700">
              {discount.currentRedemptions > 0
                ? "This discount has redemptions on historic orders — delete is disabled to keep that record intact. Deactivate instead."
                : "Permanently delete this discount. Cannot be undone."}
            </p>
            <form action={deleteAction}>
              <button
                type="submit"
                disabled={discount.currentRedemptions > 0}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="rounded-xl border border-slate-100 bg-white p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-[16px] font-bold text-ink mt-1 leading-none">{value}</p>
      {hint && (
        <p className={`text-[10px] text-slate-400 mt-1.5 ${hintTruncate ? "truncate" : ""}`}>
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
