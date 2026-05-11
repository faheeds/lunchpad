/**
 * Live discount preview endpoint — called from the web order form and
 * the iOS cart screen to show the customer what discount(s) would apply
 * to their current cart before they hit checkout.
 *
 * This endpoint is read-only — it never writes a redemption or changes
 * order state. The actual commit happens server-side in createPendingOrder
 * when the customer completes checkout, at which point the rules are
 * re-evaluated against the final cart. So a discount that previews as
 * valid might fail to apply at checkout (e.g. someone else used the last
 * redemption in the meantime) — that's intentional and safe.
 *
 * Tenant scoping: the deliveryDateId locks the request to a specific
 * restaurant. We resolve the restaurant via the delivery date's school
 * and never accept a raw restaurantId from the client.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { pickApplicableDiscounts, type CartLine } from "@/lib/discounts";

const bodySchema = z.object({
  deliveryDateId: z.string().min(1),
  schoolId: z.string().min(1),
  /** Empty/whitespace code means "auto discounts only, no code".
   *  Non-empty means "auto + check this code". */
  code: z.string().optional(),
  cartItems: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        lineTotalCents: z.coerce.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  let parsed;
  try {
    const body = await request.json();
    parsed = bodySchema.parse(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Resolve restaurant via delivery date — single source of truth, prevents
  // a malicious client from sending mismatched schoolId / deliveryDateId.
  const deliveryDate = await prisma.deliveryDate.findUnique({
    where: { id: parsed.deliveryDateId },
    include: { school: true },
  });
  if (!deliveryDate || deliveryDate.school.id !== parsed.schoolId) {
    return NextResponse.json({ error: "Invalid delivery date." }, { status: 400 });
  }

  // Pull menu-item categories in a single query — needed for category-scoped
  // discounts (ITEMS scope with categories[] populated).
  const menuItemIds = parsed.cartItems.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, restaurantId: deliveryDate.school.restaurantId },
    select: { id: true, category: true },
  });
  const categoryById = new Map(menuItems.map((m) => [m.id, m.category]));

  // Build the CartContext the engine expects.
  const lines: CartLine[] = parsed.cartItems.map((item) => ({
    menuItemId: item.menuItemId,
    category: categoryById.get(item.menuItemId) ?? null,
    lineTotalCents: item.lineTotalCents,
  }));

  // Try to attribute the request to a signed-in parent so per-user
  // redemption caps + firstOrderOnly checks work correctly. Guests
  // (no session) just appear to have zero prior orders, which means
  // welcome-offer discounts naturally apply.
  const session = await auth();
  const parentUserId =
    session?.user?.role === "PARENT" ? session.user.parentUserId ?? null : null;

  const result = await pickApplicableDiscounts({
    cart: {
      restaurantId: deliveryDate.school.restaurantId,
      schoolId: deliveryDate.school.id,
      deliveryDate: deliveryDate.deliveryDate,
      parentUserId,
      lines,
    },
    code: parsed.code,
  });

  // Detect "customer typed a code but nothing matched" so the UI can
  // surface a friendly inline error instead of silently dropping it.
  const submittedCode = (parsed.code ?? "").trim();
  const codeError = submittedCode && !result.code ? "That code isn't valid for this order." : null;

  // Strip the engine's internal Discount shape down to what the client
  // actually displays — name + amount. Hides any sensitive config (e.g.
  // maxRedemptionsTotal, eligibility rules) from the response.
  return NextResponse.json({
    auto: result.auto
      ? {
          discountId: result.auto.discount.id,
          name: result.auto.discount.name,
          amountCents: result.auto.amountCents,
        }
      : null,
    code: result.code
      ? {
          discountId: result.code.discount.id,
          name: result.code.discount.name,
          amountCents: result.code.amountCents,
        }
      : null,
    totalDiscountCents: result.totalDiscountCents,
    codeError,
  });
}
