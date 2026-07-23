/**
 * Weekly lunch plans — mobile equivalent of the web's /weekly page.
 *
 *   GET  /api/mobile/native/weekly-plans
 *     Returns the bundle the iOS planner needs:
 *       - parent's saved children (with school context)
 *       - upcoming open delivery dates per child's school for the current
 *         lunch-ordering window (next Mon–Fri typically)
 *       - menu items available on each of those dates
 *       - existing WeeklyLunchPlan rows the parent has saved
 *
 *   POST /api/mobile/native/weekly-plans
 *     Upsert one plan slot. Body:
 *       { parentChildId, weekday, menuItemId, choice?, additions?, removals? }
 *     Creates or replaces the existing (parentChildId, weekday) row.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";
import { getUpcomingSchoolWeekRange } from "@/lib/weekly-week";

export { corsOptions as OPTIONS };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);

    const parent = await prisma.parentUser.findUnique({
      where: { id: auth.parentUserId },
      include: {
        children: {
          where: { archivedAt: null },
          include: { school: true },
          orderBy: { studentName: "asc" },
        },
        weeklyPlans: {
          where: {
            isActive: true,
            parentChild: { archivedAt: null },
          },
          include: { menuItem: true },
        },
      },
    });

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404, headers: CORS_HEADERS });
    }

    // Compute the upcoming ordering window from the first child's school
    // timezone. Falls back to LA time if the parent has no children yet.
    const now = new Date();
    const primaryTimezone = parent.children[0]?.school.timezone ?? "America/Los_Angeles";
    const range = getUpcomingSchoolWeekRange(now, primaryTimezone);

    const schoolIds = [...new Set(parent.children.map((c) => c.schoolId))];

    const deliveryDates = schoolIds.length
      ? await prisma.deliveryDate.findMany({
          where: {
            schoolId: { in: schoolIds },
            orderingOpen: true,
            cutoffAt: { gt: now },
            deliveryDate: { gte: range.start, lte: range.end },
            school: { isActive: true },
          },
          include: {
            school: { select: { id: true, name: true, timezone: true, locationType: true } },
            menuAvailability: {
              where: { isAvailable: true, menuItem: { is: { isActive: true } } },
              include: {
                menuItem: {
                  include: {
                    options: { orderBy: { sortOrder: "asc" } },
                    sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
                  },
                },
              },
            },
          },
          orderBy: { deliveryDate: "asc" },
        })
      : [];

    return NextResponse.json(
      {
        children: parent.children.map((c) => ({
          id: c.id,
          schoolId: c.schoolId,
          schoolName: c.school.name,
	  locationType: c.school.locationType,
          studentName: c.studentName,
          grade: c.grade,
        })),
        deliveryDates: deliveryDates.map((d) => ({
          id: d.id,
          schoolId: d.schoolId,
          deliveryDate: d.deliveryDate.toISOString(),
          cutoffAt: d.cutoffAt.toISOString(),
          school: d.school,
          menuItems: d.menuAvailability.map((entry) => ({
            id: entry.menuItem.id,
            slug: entry.menuItem.slug,
            name: entry.menuItem.name,
            description: entry.menuItem.description,
            imageUrl: entry.menuItem.imageUrl,
            basePriceCents: entry.menuItem.basePriceCents,
            // Pick-one required choices — surfaced so the iOS weekly
            // planner can render a picker on items that demand one.
            requiredChoices: entry.menuItem.requiredChoices,
            options: entry.menuItem.options.map((o) => ({
              id: o.id,
              name: o.name,
              optionType: o.optionType,
              priceDeltaCents: o.priceDeltaCents,
            })),
            // Size variants — surfaced so the iOS weekly planner can
            // render a size picker on sized items (e.g. pizza S/M/L).
            sizes: entry.menuItem.sizes.map((sz) => ({
              id: sz.id,
              name: sz.name,
              priceCents: sz.priceCents,
            })),
          })),
        })),
        plans: parent.weeklyPlans.map((p) => ({
          id: p.id,
          parentChildId: p.parentChildId,
          weekday: p.weekday,
          menuItemId: p.menuItemId,
          menuItemName: p.menuItem.name,
          choice: p.choice,
          size: p.size,
          additions: p.additions,
          removals: p.removals,
          isActive: p.isActive,
        })),
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to load weekly plans";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);

    const body = await request.json();
    const parentChildId = String(body.parentChildId ?? "");
    const weekday = Number(body.weekday);
    const menuItemId = String(body.menuItemId ?? "");
    const choice = body.choice ? String(body.choice) : undefined;
    const size = body.size ? String(body.size) : undefined;
    const additions: string[] = Array.isArray(body.additions) ? body.additions.map(String) : [];
    const removals: string[] = Array.isArray(body.removals) ? body.removals.map(String) : [];

    if (!parentChildId || !menuItemId || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      return NextResponse.json(
        { error: "parentChildId, menuItemId, and weekday (1-7) are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Verify ownership: the child must belong to the calling parent.
    const child = await prisma.parentChild.findFirst({
      where: { id: parentChildId, parentUserId: auth.parentUserId, archivedAt: null },
    });
    if (!child) {
      return NextResponse.json(
        { error: "Child not found on your account" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Verify menu item exists and is active at the same tenant.
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: menuItemId, isActive: true },
      select: { id: true, restaurantId: true },
    });
    if (!menuItem) {
      return NextResponse.json(
        { error: "Menu item not available" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Multiple meals per (parentChild, weekday) are allowed — each POST
    // adds a new plan row. To change a meal the client removes the old
    // row via DELETE and adds a new one.
    const plan = await prisma.weeklyLunchPlan.create({
      data: {
        parentUserId: auth.parentUserId,
        parentChildId,
        schoolId: child.schoolId,
        weekday,
        menuItemId,
        choice,
        size,
        additions,
        removals,
      },
      include: { menuItem: true },
    });

    return NextResponse.json(
      {
        id: plan.id,
        parentChildId: plan.parentChildId,
        weekday: plan.weekday,
        menuItemId: plan.menuItemId,
        menuItemName: plan.menuItem.name,
        choice: plan.choice,
        size: plan.size,
        additions: plan.additions,
        removals: plan.removals,
        isActive: plan.isActive,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to save plan";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
