import { describe, expect, it } from "vitest";
import { type CartContext, type CartLine, evaluate, evaluateBogo, type EvalContext } from "@/lib/discounts";
import type { Discount } from "@prisma/client";

// Helper to create a minimal Discount object with realistic defaults
function createDiscount(overrides: Partial<Discount> = {}): Discount {
  const now = new Date();
  return {
    id: "discount-1",
    restaurantId: "restaurant-1",
    templateKind: "BOGO",
    name: "Test Discount",
    description: null,
    code: null,
    kind: "FIXED_AMOUNT",
    value: 500, // $5 in cents
    scope: "ORDER",
    itemIds: [],
    categories: [],
    minOrderCents: null,
    minItemCount: null,
    firstOrderOnly: false,
    schoolIds: [],
    weekdays: [],
    startsAt: null,
    endsAt: null,
    maxRedemptionsTotal: null,
    maxRedemptionsPerUser: null,
    allowStackingWithCode: false,
    bogoBuyItemIds: [],
    bogoGetItemIds: [],
    isActive: true,
    currentRedemptions: 0,
    createdAt: now,
    updatedAt: now,
    createdByAdminId: null,
    ...overrides,
  };
}

// Helper to create an EvalContext
function createEvalContext(cart: CartContext): EvalContext {
  return {
    cart,
    priorOrderCount: 0,
    perUserCounts: new Map(),
  };
}

describe("BOGO Discount Evaluation Logic", () => {
  describe("Algorithm", () => {
    it("should identify buy/get matching correctly with disjoint sets", () => {
      // cart lines:
      // [0]: burger ($10)
      // [1]: side ($5)

      // buy set: ["burger-id"], get set: ["side-id"]
      // buyMatches: [0], getMatches: [1]
      // no overlap, should discount index 1 (side)

      const lines: CartLine[] = [
        { menuItemId: "burger-id", lineTotalCents: 1000 },
        { menuItemId: "side-id", lineTotalCents: 500 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["burger-id"],
        bogoGetItemIds: ["side-id"],
        kind: "PERCENT",
        value: 100, // 100% off
      });

      const ctx = createEvalContext(cart);
      const result = evaluateBogo(discount, ctx);

      expect(result.amountCents).toBe(500); // 100% of $5 side
      expect(result.reason).toBeNull();
    });

    it("should apply overlap guard: reject when only one unit and sets overlap", () => {
      // cart lines:
      // [0]: burger ($10)

      // buy set: ["burger-id"], get set: ["burger-id"]
      // buyMatches: [0], getMatches: [0]
      // For getMatches[0] (index 0), check if there's another buyMatch at different index
      // buyMatches has only [0], which is the same index, so NO other buyMatch
      // should reject

      const lines: CartLine[] = [
        { menuItemId: "burger-id", lineTotalCents: 1000 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["burger-id"],
        bogoGetItemIds: ["burger-id"],
      });

      const ctx = createEvalContext(cart);
      const result = evaluateBogo(discount, ctx);

      expect(result.amountCents).toBe(0);
      expect(result.reason).toBe("Add another qualifying item to use this discount.");
    });

    it("should apply overlap guard: accept when two units and sets overlap", () => {
      // cart lines:
      // [0]: burger ($10)
      // [1]: burger ($8) <- cheapest, sorted first

      // buy set: ["burger-id"], get set: ["burger-id"]
      // buyMatches: [0, 1], getMatches: [1, 0] -> sorted by price: [1, 0]
      // For getMatches[0] (index 1), check if there's another buyMatch at different index
      // buyMatches has [0, 1], and 0 != 1, so YES there's another
      // should accept and discount index 1 (the cheaper burger at $8)

      const lines: CartLine[] = [
        { menuItemId: "burger-id", lineTotalCents: 1000 },
        { menuItemId: "burger-id", lineTotalCents: 800 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["burger-id"],
        bogoGetItemIds: ["burger-id"],
        kind: "PERCENT",
        value: 100, // 100% off
      });

      const ctx = createEvalContext(cart);
      const result = evaluateBogo(discount, ctx);

      expect(result.amountCents).toBe(800); // 100% of $8 (the cheaper one)
      expect(result.reason).toBeNull();
    });

    it("should sort get-matches by price ascending (cheapest first)", () => {
      // cart lines:
      // [0]: burger ($10)
      // [1]: side ($6)
      // [2]: drink ($3) <- cheapest

      // buy set: ["burger-id"], get set: ["side-id", "drink-id"]
      // buyMatches: [0]
      // getMatches raw: [1, 2] (in order of appearance)
      // getMatches sorted: [2, 1] (by price ascending)
      // should discount index 2 (drink, the cheapest)

      const lines: CartLine[] = [
        { menuItemId: "burger-id", lineTotalCents: 1000 },
        { menuItemId: "side-id", lineTotalCents: 600 },
        { menuItemId: "drink-id", lineTotalCents: 300 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["burger-id"],
        bogoGetItemIds: ["side-id", "drink-id"],
        kind: "PERCENT",
        value: 100, // 100% off
      });

      const ctx = createEvalContext(cart);
      const result = evaluateBogo(discount, ctx);

      expect(result.amountCents).toBe(300); // 100% of $3 drink (the cheapest)
      expect(result.reason).toBeNull();
    });

    it("should apply discount amount based on discount kind and cap at line price", () => {
      const lines: CartLine[] = [
        { menuItemId: "item-a", lineTotalCents: 1000 },
        { menuItemId: "item-b", lineTotalCents: 500 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      // Case 1: PERCENT 100 (fully free on $5 item)
      const discount1 = createDiscount({
        bogoBuyItemIds: ["item-a"],
        bogoGetItemIds: ["item-b"],
        kind: "PERCENT",
        value: 100,
      });
      const ctx1 = createEvalContext(cart);
      const result1 = evaluateBogo(discount1, ctx1);
      expect(result1.amountCents).toBe(500); // 100% of $5

      // Case 2: PERCENT 50 (half off $5 item)
      const discount2 = createDiscount({
        bogoBuyItemIds: ["item-a"],
        bogoGetItemIds: ["item-b"],
        kind: "PERCENT",
        value: 50,
      });
      const ctx2 = createEvalContext(cart);
      const result2 = evaluateBogo(discount2, ctx2);
      expect(result2.amountCents).toBe(250); // 50% of $5

      // Case 3: FIXED_AMOUNT $3
      const discount3 = createDiscount({
        bogoBuyItemIds: ["item-a"],
        bogoGetItemIds: ["item-b"],
        kind: "FIXED_AMOUNT",
        value: 300,
      });
      const ctx3 = createEvalContext(cart);
      const result3 = evaluateBogo(discount3, ctx3);
      expect(result3.amountCents).toBe(300);

      // Case 4: FIXED_AMOUNT $10 on $5 item -> capped at $5
      const discount4 = createDiscount({
        bogoBuyItemIds: ["item-a"],
        bogoGetItemIds: ["item-b"],
        kind: "FIXED_AMOUNT",
        value: 1000,
      });
      const ctx4 = createEvalContext(cart);
      const result4 = evaluateBogo(discount4, ctx4);
      expect(result4.amountCents).toBe(500); // capped at line price
    });

    it("should reject with correct message when no buy-set item", () => {
      const lines: CartLine[] = [
        { menuItemId: "side-id", lineTotalCents: 500 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["burger-id"],
        bogoGetItemIds: ["side-id"],
      });

      const ctx = createEvalContext(cart);
      const result = evaluateBogo(discount, ctx);

      expect(result.amountCents).toBe(0);
      expect(result.reason).toBe("Cart doesn't contain a qualifying item to buy.");
    });

    it("should reject with correct message when no get-set item", () => {
      const lines: CartLine[] = [
        { menuItemId: "burger-id", lineTotalCents: 1000 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["burger-id"],
        bogoGetItemIds: ["side-id"],
      });

      const ctx = createEvalContext(cart);
      const result = evaluateBogo(discount, ctx);

      expect(result.amountCents).toBe(0);
      expect(result.reason).toBe("Cart doesn't contain a qualifying item to discount.");
    });

    it("should reject with correct message when overlap guard fails", () => {
      const lines: CartLine[] = [
        { menuItemId: "burger-id", lineTotalCents: 1000 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["burger-id"],
        bogoGetItemIds: ["burger-id"],
      });

      const ctx = createEvalContext(cart);
      const result = evaluateBogo(discount, ctx);

      expect(result.amountCents).toBe(0);
      expect(result.reason).toBe("Add another qualifying item to use this discount.");
    });
  });

  describe("Integration with regular discounts", () => {
    it("should not apply BOGO logic when both sets are empty", () => {
      // A discount with empty bogoBuyItemIds and bogoGetItemIds
      // should NOT trigger BOGO logic, and should fall through to
      // normal scope/computeAmount path

      const lines: CartLine[] = [
        { menuItemId: "item-1", lineTotalCents: 1000 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: [],
        bogoGetItemIds: [],
        scope: "ORDER",
        kind: "FIXED_AMOUNT",
        value: 200, // $2 off
      });

      const ctx = createEvalContext(cart);
      const result = evaluate(discount, ctx);

      // Should apply as regular ORDER-scope discount, not BOGO
      expect(result.amountCents).toBe(200);
      expect(result.reason).toBeNull();
    });

    it("should not trigger BOGO when only buy set is populated", () => {
      // With the fixed condition (&&), a discount with only
      // bogoBuyItemIds populated should NOT trigger BOGO

      const lines: CartLine[] = [
        { menuItemId: "item-1", lineTotalCents: 1000 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: ["item-1"],
        bogoGetItemIds: [], // empty
        scope: "ORDER",
        kind: "FIXED_AMOUNT",
        value: 200,
      });

      const ctx = createEvalContext(cart);
      const result = evaluate(discount, ctx);

      // Should fall through to normal discount logic, not BOGO
      expect(result.amountCents).toBe(200);
      expect(result.reason).toBeNull();
    });

    it("should not trigger BOGO when only get set is populated", () => {
      // With the fixed condition (&&), a discount with only
      // bogoGetItemIds populated should NOT trigger BOGO

      const lines: CartLine[] = [
        { menuItemId: "item-1", lineTotalCents: 1000 },
      ];

      const cart: CartContext = {
        restaurantId: "r1",
        schoolId: "s1",
        deliveryDate: new Date(),
        parentUserId: null,
        lines,
      };

      const discount = createDiscount({
        bogoBuyItemIds: [], // empty
        bogoGetItemIds: ["item-1"],
        scope: "ORDER",
        kind: "FIXED_AMOUNT",
        value: 200,
      });

      const ctx = createEvalContext(cart);
      const result = evaluate(discount, ctx);

      // Should fall through to normal discount logic, not BOGO
      expect(result.amountCents).toBe(200);
      expect(result.reason).toBeNull();
    });
  });
});
