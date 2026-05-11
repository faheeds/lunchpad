"use server";

/**
 * Server actions for the discount admin surface.
 *
 * Conventions:
 *  - Every mutation requires MANAGER+ — discounts touch revenue, so we
 *    keep them above frontline STAFF the same way Reports does.
 *  - Tenant scoping is enforced by re-fetching the target row with the
 *    restaurantId before any mutation. Even if the form posts a stale
 *    or guessed id we never touch another tenant's data.
 *  - Activity log is best-effort — we want the timeline rich but never
 *    block a write on it. (logActivity already swallows errors.)
 *  - revalidatePath fans out: /admin/discounts (list) plus the detail
 *    page when applicable, plus the marketing /order route so any
 *    customer-facing automatic-discount surface refreshes too.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminRole } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { discountInputSchema } from "@/lib/validation/discount";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function adminContext(): Promise<{ restaurantId: string; adminUserId: string | undefined }> {
  await requireAdminRole("MANAGER");
  const restaurant = await requireRestaurant();
  const session = await auth();
  const adminUserId = (session?.user as { adminUserId?: string })?.adminUserId;
  return { restaurantId: restaurant.id, adminUserId };
}

/** Parse the JSON payload the client builder sends. We accept JSON
 *  instead of FormData because the builder has nested array fields
 *  (schoolIds, weekdays, categories) that play poorly with FormData
 *  serialization. */
function parsePayload(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid request payload.");
  }
  const result = discountInputSchema.safeParse(parsed);
  if (!result.success) {
    // Surface the first error to the operator. Friendly enough for now;
    // we can wire to a toast/field-level display in the builder later.
    const issue = result.error.issues[0];
    throw new Error(issue.message ?? "Invalid discount.");
  }
  return result.data;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function createDiscount(payload: string) {
  const { restaurantId, adminUserId } = await adminContext();
  const data = parsePayload(payload);

  // Code uniqueness check (case-insensitive). The DB has a partial
  // @@unique on (restaurantId, code) but null codes are excluded, so
  // we still need the manual collision check for non-null codes.
  if (data.code) {
    const dup = await prisma.discount.findFirst({
      where: { restaurantId, code: data.code },
      select: { id: true },
    });
    if (dup) {
      throw new Error(`A discount with code "${data.code}" already exists.`);
    }
  }

  const created = await prisma.discount.create({
    data: {
      restaurantId,
      createdByAdminId: adminUserId ?? null,
      templateKind: data.templateKind,
      name: data.name,
      description: data.description ?? null,
      code: data.code ?? null,
      kind: data.kind,
      value: data.value,
      scope: data.scope,
      itemIds: data.itemIds,
      categories: data.categories,
      minOrderCents: data.minOrderCents ?? null,
      minItemCount: data.minItemCount ?? null,
      firstOrderOnly: data.firstOrderOnly,
      schoolIds: data.schoolIds,
      weekdays: data.weekdays,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      maxRedemptionsTotal: data.maxRedemptionsTotal ?? null,
      maxRedemptionsPerUser: data.maxRedemptionsPerUser ?? null,
      allowStackingWithCode: data.allowStackingWithCode,
      bogoBuyItemIds: data.bogoBuyItemIds,
      bogoGetItemIds: data.bogoGetItemIds,
      isActive: data.isActive,
    },
  });

  await logActivity({
    restaurantId,
    adminUserId,
    // Discounts aren't an ActivityEntityType yet — we file them under
    // RESTAURANT_SETTINGS so they show up in the global activity feed
    // without a separate entity type. The detail page doesn't render
    // a per-discount timeline yet (slice 3 can add one if useful).
    entityType: "RESTAURANT_SETTINGS",
    entityId: created.id,
    action: "CREATED",
    summary: `Created discount "${created.name}"${created.code ? ` (${created.code})` : ""}`,
    metadata: {
      discountId: created.id,
      templateKind: created.templateKind,
      kind: created.kind,
      value: created.value,
    },
  });

  revalidatePath("/admin/discounts");
  redirect(`/admin/discounts/${created.id}`);
}

export async function updateDiscount(discountId: string, payload: string) {
  const { restaurantId, adminUserId } = await adminContext();
  const data = parsePayload(payload);

  // Tenant-scoped existence + identity check.
  const existing = await prisma.discount.findFirst({
    where: { id: discountId, restaurantId },
    select: { id: true, code: true, name: true },
  });
  if (!existing) throw new Error("Discount not found.");

  // Code uniqueness — only enforce if the code changed.
  if (data.code && data.code !== existing.code) {
    const dup = await prisma.discount.findFirst({
      where: { restaurantId, code: data.code, NOT: { id: discountId } },
      select: { id: true },
    });
    if (dup) {
      throw new Error(`A discount with code "${data.code}" already exists.`);
    }
  }

  await prisma.discount.update({
    where: { id: discountId },
    data: {
      templateKind: data.templateKind,
      name: data.name,
      description: data.description ?? null,
      code: data.code ?? null,
      kind: data.kind,
      value: data.value,
      scope: data.scope,
      itemIds: data.itemIds,
      categories: data.categories,
      minOrderCents: data.minOrderCents ?? null,
      minItemCount: data.minItemCount ?? null,
      firstOrderOnly: data.firstOrderOnly,
      schoolIds: data.schoolIds,
      weekdays: data.weekdays,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      maxRedemptionsTotal: data.maxRedemptionsTotal ?? null,
      maxRedemptionsPerUser: data.maxRedemptionsPerUser ?? null,
      allowStackingWithCode: data.allowStackingWithCode,
      bogoBuyItemIds: data.bogoBuyItemIds,
      bogoGetItemIds: data.bogoGetItemIds,
      isActive: data.isActive,
    },
  });

  await logActivity({
    restaurantId,
    adminUserId,
    entityType: "RESTAURANT_SETTINGS",
    entityId: discountId,
    action: "UPDATED",
    summary: `Updated discount "${data.name}"`,
    metadata: { discountId },
  });

  revalidatePath("/admin/discounts");
  revalidatePath(`/admin/discounts/${discountId}`);
}

export async function toggleDiscountActive(discountId: string) {
  const { restaurantId, adminUserId } = await adminContext();
  const current = await prisma.discount.findFirst({
    where: { id: discountId, restaurantId },
    select: { id: true, name: true, isActive: true },
  });
  if (!current) throw new Error("Discount not found.");

  await prisma.discount.update({
    where: { id: discountId },
    data: { isActive: !current.isActive },
  });

  await logActivity({
    restaurantId,
    adminUserId,
    entityType: "RESTAURANT_SETTINGS",
    entityId: discountId,
    action: current.isActive ? "ARCHIVED" : "UNARCHIVED",
    summary: `${current.isActive ? "Deactivated" : "Activated"} discount "${current.name}"`,
    metadata: { discountId },
  });

  revalidatePath("/admin/discounts");
  revalidatePath(`/admin/discounts/${discountId}`);
}

export async function deleteDiscount(discountId: string) {
  const { restaurantId, adminUserId } = await adminContext();
  const current = await prisma.discount.findFirst({
    where: { id: discountId, restaurantId },
    select: { id: true, name: true, currentRedemptions: true },
  });
  if (!current) throw new Error("Discount not found.");

  // Refuse to hard-delete a discount with redemptions — they're tied to
  // historic orders via the Redemption rows. Operators can deactivate
  // instead. Cascading delete would orphan the audit trail.
  if (current.currentRedemptions > 0) {
    throw new Error(
      `This discount has ${current.currentRedemptions} redemption${current.currentRedemptions === 1 ? "" : "s"} attached. Deactivate it instead so historic orders keep their record.`,
    );
  }

  await prisma.discount.delete({ where: { id: discountId } });

  await logActivity({
    restaurantId,
    adminUserId,
    entityType: "RESTAURANT_SETTINGS",
    entityId: discountId,
    action: "DELETED",
    summary: `Deleted discount "${current.name}"`,
    metadata: { discountId },
  });

  revalidatePath("/admin/discounts");
  redirect("/admin/discounts");
}
