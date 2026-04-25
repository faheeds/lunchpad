import { describe, expect, it } from "vitest";
import { mapOrderToLabelRows } from "@/lib/pdf/labels";

describe("label generation mapping", () => {
  it("maps order details into label-friendly rows", () => {
    const labels = mapOrderToLabelRows([
      {
        id: "order_1",
        orderNumber: "SL-20260401-1001",
        schoolId: "school_1",
        deliveryDateId: "delivery_1",
        studentId: "student_1",
        parentName: "Parent",
        parentEmail: "parent@example.com",
        specialInstructions: "Cut sandwich",
        subtotalCents: 1000,
        totalCents: 1000,
        currency: "usd",
        status: "PAID",
        paidAt: new Date(),
        refundedAt: null,
        cancelledAt: null,
        confirmationSentAt: null,
        checkoutSessionId: "cs_test",
        paymentIntentId: "pi_test",
        createdAt: new Date(),
        updatedAt: new Date(),
        school: { id: "school_1", name: "Lincoln", slug: "lincoln", timezone: "America/Los_Angeles", defaultCutoffHour: 17, defaultCutoffMinute: 0, collectTeacher: true, collectClassroom: true, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        deliveryDate: { id: "delivery_1", schoolId: "school_1", deliveryDate: new Date(), cutoffAt: new Date(), orderingOpen: true, notes: null, createdAt: new Date(), updatedAt: new Date() },
        student: { id: "student_1", schoolId: "school_1", studentName: "Ava Smith", grade: "3", teacherName: "Ms. Lee", classroom: "12", allergyNotes: "Nut allergy", dietaryNotes: null, createdAt: new Date(), updatedAt: new Date() },
        items: [{ id: "item_1", orderId: "order_1", menuItemId: "menu_1", itemNameSnapshot: "Turkey Sandwich Box", basePriceCents: 1000, additions: ["Avocado"], removals: ["Tomato"], allergyNotes: "Nut allergy", dietaryNotes: null, specialInstructions: "Cut sandwich", lineTotalCents: 1000, createdAt: new Date(), updatedAt: new Date() }]
      } as never
    ]);

    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      studentName: "Ava Smith",
      grade: "3",
      itemName: "Turkey Sandwich Box",
      additions: ["Avocado"],
      removals: ["Tomato"],
      alert: "Nut allergy"
    });
  });
});
