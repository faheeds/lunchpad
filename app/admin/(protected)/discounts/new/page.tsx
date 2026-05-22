import type { Metadata } from "next";
/**
 * Template gallery — the front door for creating a discount.
 *
 * Design choice: every discount type the platform supports is in the
 * gallery even if its builder isn't shipped yet. Operators see what's
 * coming (sets the expectation that the surface keeps growing) and
 * have a single mental map of "where do I go to set up X?"
 *
 * Unavailable templates get the same card treatment but are dimmed,
 * tagged "Coming soon", and route to a non-destructive interstitial
 * (we keep them clickable so an operator can confirm "yep, that's
 * the thing I want, but it's not ready yet" rather than wondering
 * if their click did nothing).
 */

import Link from "next/link";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { TEMPLATES } from "@/lib/discount-templates";
import { DiscountTemplateBadge } from "@/components/admin/discount-icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New Discount",
};

export default async function DiscountTemplateGalleryPage() {
  await requireRestaurant();
  await requireAdminRole("MANAGER");

  return (
    <div className="min-h-screen bg-editorial-paper">
      <div className="max-w-4xl mx-auto py-6 px-4">
        <div className="mb-6">
          <Link
            href="/admin/discounts"
            className="text-[12px] text-editorial-ink-soft no-underline inline-flex items-center gap-1 hover:text-editorial-ink"
          >
            ← Discounts
          </Link>
          <h1 className="text-[20px] font-editorial font-semibold text-editorial-ink mt-2">What kind of discount?</h1>
          <p className="text-[13px] text-editorial-ink-soft mt-1">
            Pick a template to start with — you can change anything once inside.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <Link
              key={t.slug}
              href={`/admin/discounts/new/${t.slug}`}
              className={`relative block rounded-[16px] border p-4 no-underline transition shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)] ${
                t.available
                  ? "border-editorial-line bg-white hover:border-editorial-green hover:shadow-[0_18px_44px_-22px_rgba(44,64,49,0.30)]"
                  : "border-editorial-line bg-editorial-paper-2 opacity-75 hover:opacity-100"
              }`}
            >
              {!t.available && (
                <span className="absolute top-2.5 right-2.5 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#F6EED9] text-[#6E5C2C] border border-[#E5D6A8]">
                  COMING SOON
                </span>
              )}
              <div className="mb-3">
                <DiscountTemplateBadge kind={t.kind} size="lg" />
              </div>
              <h2 className="text-[14px] font-semibold text-editorial-ink leading-tight">{t.title}</h2>
              <p className="text-[12px] text-editorial-ink-soft leading-snug mt-1 min-h-[34px]">
                {t.description}
              </p>
              <p className="text-[11px] text-editorial-green font-medium mt-2">{t.example}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
