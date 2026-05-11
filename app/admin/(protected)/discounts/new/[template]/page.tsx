/**
 * New-discount entry page — dispatches into the live builder with
 * defaults seeded from the chosen template.
 *
 * If the template doesn't have an available builder yet (slice 2 only
 * ships welcome/promo-code/sibling) we show a friendly "Coming soon"
 * card with a link back to the gallery. This lets the gallery list
 * every planned template without strewing 404s through the experience.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { getTemplate, type TemplateMeta } from "@/lib/discount-templates";
import { DiscountBuilder, type BuilderState } from "@/components/admin/discount-builder";
import { DiscountTemplateBadge, type DiscountIconName } from "@/components/admin/discount-icons";

export const dynamic = "force-dynamic";

export default async function NewDiscountPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template: templateSlug } = await params;
  const template = getTemplate(templateSlug);
  if (!template) notFound();

  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  if (!template.available) {
    return <ComingSoon template={template} />;
  }

  const schools = await prisma.school.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const initial = seedState(template);

  return <DiscountBuilder template={template} initial={initial} schools={schools} />;
}

function seedState(t: TemplateMeta): BuilderState {
  const d = t.defaults;
  return {
    templateKind: t.kind,
    name: d.name,
    description: "",
    code: "",
    kind: d.kind,
    // Display unit: percent stays as an integer (1-100), fixed amount
    // gets converted from cents to dollars for the input field.
    valueDisplay: d.kind === "PERCENT" ? String(d.value) : (d.value / 100).toFixed(d.value % 100 === 0 ? 0 : 2),
    scope: d.scope,
    itemIds: [],
    categories: [],
    minOrderDollars: d.minOrderCents ? String(d.minOrderCents / 100) : "",
    minItemCount: d.minItemCount ? String(d.minItemCount) : "",
    firstOrderOnly: d.firstOrderOnly,
    schoolIds: [],
    weekdays: d.weekdays,
    startsAt: "",
    endsAt: "",
    maxRedemptionsTotal: "",
    maxRedemptionsPerUser: d.maxRedemptionsPerUser ? String(d.maxRedemptionsPerUser) : "",
    allowStackingWithCode: false,
    isActive: true,
  };
}

function ComingSoon({ template }: { template: TemplateMeta }) {
  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center">
        <div className="flex justify-center mb-3">
          <DiscountTemplateBadge kind={template.kind as DiscountIconName} size="lg" />
        </div>
        <h1 className="text-[17px] font-bold text-ink">{template.title} — coming soon</h1>
        <p className="text-[13px] text-slate-500 mt-2 leading-relaxed max-w-sm mx-auto">
          {template.description} The builder for this template isn't ready yet, but
          it's queued. For now, the three available templates (Welcome offer, Promo
          code, Sibling discount) cover most use cases.
        </p>
        <Link
          href="/admin/discounts/new"
          className="inline-flex items-center mt-4 px-4 py-2 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-700 no-underline hover:bg-slate-50"
        >
          ← Back to templates
        </Link>
      </div>
    </div>
  );
}
