/**
 * Activity-log helper. One entry point for every audit event.
 *
 * Use sparingly but consistently — every call writes a row, so don't log
 * inside loops over hundreds of items (write a single bulk-summary entry
 * instead). Most call sites look like:
 *
 *   await logActivity({
 *     restaurantId,
 *     adminUserId,                       // or parentUserId, or neither
 *     entityType: "ORDER",
 *     entityId: order.id,
 *     action: "CREATED",
 *     summary: `Order ${order.orderNumber} created — ${formatCurrency(order.totalCents)}`,
 *     metadata: { totalCents: order.totalCents, paymentMode: "stripe_link" },
 *   });
 *
 * This is best-effort: failures swallow + log to console rather than
 * throwing back into the caller. Audit trails are a should, not a must,
 * and we don't want a transient DB blip to roll back a real mutation
 * (e.g. a paid order that fails to log "PAID" should still be marked paid).
 */

import { prisma } from "@/lib/db";

export type ActivityEntityType =
  | "ORDER"
  | "MENU_ITEM"
  | "DELIVERY_DATE"
  | "SCHOOL"
  | "RESTAURANT_SETTINGS"
  | "TEAM_MEMBER"
  | "ADMIN_INVITE"
  | "WEEKLY_BATCH";

export type ActivityAction =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "PAID"
  | "REFUNDED"
  | "CANCELLED"
  | "ARCHIVED"
  | "UNARCHIVED"
  | "MODIFIED"
  | "COMPED"
  | "INVITED"
  | "INVITE_ACCEPTED"
  | "INVITE_REVOKED"
  | "ROLE_CHANGED"
  | "REMOVED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "LOGGED_IN";

export async function logActivity(args: {
  restaurantId: string;
  /** Admin who performed the action. Null when the event is customer-driven
   *  (use parentUserId) or system-driven (both null). */
  adminUserId?: string | null;
  /** Parent who performed the action. Null when the event is admin-driven
   *  or system-driven. */
  parentUserId?: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  /** One-line human-readable summary shown in the UI. Keep it < ~120 chars. */
  summary: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        restaurantId: args.restaurantId,
        adminUserId: args.adminUserId ?? null,
        parentUserId: args.parentUserId ?? null,
        entityType: args.entityType,
        entityId: args.entityId,
        action: args.action,
        summary: args.summary,
        metadata: (args.metadata as object | null) ?? undefined,
      },
    });
  } catch (err) {
    // Audit logging shouldn't take down the caller. Fail loud in logs so
    // dropped audits show up in Vercel function logs, but don't throw.
    console.error("[activity-log] failed:", err);
  }
}

/**
 * Read the activity feed for a restaurant. Either restaurant-wide (omit
 * entity filters) or scoped to a single entity (pass entityType + entityId)
 * for the per-order timeline.
 */
export async function listActivity(args: {
  restaurantId: string;
  entityType?: ActivityEntityType;
  entityId?: string;
  /** Default 50. Max 500 to keep page weight reasonable. */
  limit?: number;
}) {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  return prisma.activityLog.findMany({
    where: {
      restaurantId: args.restaurantId,
      ...(args.entityType ? { entityType: args.entityType } : {}),
      ...(args.entityId ? { entityId: args.entityId } : {}),
    },
    include: {
      adminUser: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
