import { describe, expect, it } from "vitest";
import { getLabelMetaLines } from "@/lib/pdf/labels";

// LabelOrder shape — only the fields getLabelMetaLines actually touches.
// Using `as unknown as Parameters<typeof getLabelMetaLines>[0]` avoids
// satisfying every Prisma column.
type MinimalOrder = Parameters<typeof getLabelMetaLines>[0];

const BASE_SCHOOL = {
  id: "school-1",
  name: "Lincoln Elementary",
  locationType: "SCHOOL" as const,
  timezone: "America/New_York",
  restaurantId: "rest-1",
  slug: "lincoln",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  allergyOptions: [],
  dietaryOptions: [],
  address: null,
  city: null,
  state: null,
  zip: null,
  contactEmail: null,
  contactPhone: null,
};

const BASE_STUDENT = {
  id: "student-1",
  studentName: "Alex",
  grade: "3rd",
  teacherName: "Mrs. Smith",
  classroom: "12",
  allergyNotes: null,
  parentChildId: "child-1",
  orderId: "order-1",
  dietaryNotes: null,
  specialInstructions: null,
};

const BASE_DELIVERY_DATE = {
  id: "dd-1",
  deliveryDate: new Date("2026-08-01T11:00:00Z"),
  originalCutoffAt: null,
  cutoffAt: new Date("2026-07-31T23:00:00Z"),
  orderingOpen: true,
  schoolId: "school-1",
  restaurantId: "rest-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeOrder(
  schoolOverrides: Record<string, unknown> = {},
  studentOverrides: Record<string, unknown> = {}
): MinimalOrder {
  return {
    id: "order-1",
    orderNumber: "LUN-001",
    status: "PAID",
    totalCents: 895,
    parentUserId: "parent-1",
    restaurantId: "rest-1",
    schoolId: "school-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    discountCode: null,
    discountCents: null,
    stripeSessionId: null,
    parentChildId: "child-1",
    deliveryDateId: "dd-1",
    school: { ...BASE_SCHOOL, ...schoolOverrides },
    student: { ...BASE_STUDENT, ...studentOverrides },
    deliveryDate: BASE_DELIVERY_DATE,
    items: [],
  } as unknown as MinimalOrder;
}

// ---------------------------------------------------------------------------
// SCHOOL location
// ---------------------------------------------------------------------------

describe("getLabelMetaLines — SCHOOL location", () => {
  it("line1: grade and school name", () => {
    const order = makeOrder({ name: "Lincoln Elementary", locationType: "SCHOOL" }, { grade: "3rd" });
    const { line1 } = getLabelMetaLines(order);
    expect(line1).toBe("Grade 3rd | Lincoln Elementary");
  });

  it("line2: teacher and room when both present", () => {
    const order = makeOrder({}, { teacherName: "Mrs. Smith", classroom: "12" });
    const { line2 } = getLabelMetaLines(order);
    expect(line2).toBe("Mrs. Smith | Room 12");
  });

  it("line2: 'Teacher n/a' when teacherName is null and classroom is null", () => {
    const order = makeOrder({}, { teacherName: null, classroom: null });
    const { line2 } = getLabelMetaLines(order);
    expect(line2).toBe("Teacher n/a");
  });

  it("line2: teacher only, no Room suffix, when classroom is null", () => {
    const order = makeOrder({}, { teacherName: "Mr. Jones", classroom: null });
    const { line2 } = getLabelMetaLines(order);
    expect(line2).toBe("Mr. Jones");
  });

  it("line2: 'Teacher n/a' when teacherName is empty string", () => {
    const order = makeOrder({}, { teacherName: "", classroom: null });
    const { line2 } = getLabelMetaLines(order);
    expect(line2).toBe("Teacher n/a");
  });
});

// ---------------------------------------------------------------------------
// OFFICE location
// ---------------------------------------------------------------------------

describe("getLabelMetaLines — OFFICE location", () => {
  it("line1: just the office name", () => {
    const order = makeOrder({ name: "Acme HQ", locationType: "OFFICE" });
    const { line1 } = getLabelMetaLines(order);
    expect(line1).toBe("Acme HQ");
  });

  it("line2: null (no teacher/room row)", () => {
    const order = makeOrder({ locationType: "OFFICE" });
    const { line2 } = getLabelMetaLines(order);
    expect(line2).toBeNull();
  });

  it("adversarial: grade is not leaked into line1", () => {
    const order = makeOrder(
      { name: "Acme HQ", locationType: "OFFICE" },
      { grade: "Senior Engineer" }
    );
    const { line1 } = getLabelMetaLines(order);
    expect(line1).not.toContain("Grade");
    expect(line1).not.toContain("Senior Engineer");
    expect(line1).toBe("Acme HQ");
  });

  it("adversarial: teacher name is not leaked into line2", () => {
    const order = makeOrder(
      { locationType: "OFFICE" },
      { teacherName: "Manager Bob", classroom: "Suite 5" }
    );
    const { line2 } = getLabelMetaLines(order);
    expect(line2).toBeNull();
  });
});
