import { z } from "zod";

const optionalTextField = z.preprocess((value) => {
  if (value === null || value === undefined) return "";
  return value;
}, z.string().optional().default(""));

export const orderCartItemSchema = z.object({
  menuItemId: z.string().min(1),
  choice: z.string().optional(),
  additions: z.array(z.string()).default([]),
  removals: z.array(z.string()).default([])
});

export const orderFormSchema = z.object({
  parentName: z.string().min(2),
  parentEmail: z.string().email(),
  schoolId: z.string().min(1),
  deliveryDateId: z.string().min(1),
  parentChildId: z.string().optional(),
  studentName: z.string().min(2),
  // Grade is required for SCHOOL locations and not collected at all for OFFICE
  // locations — accept it as optional here and let createPendingOrder fill in
  // a sensible default ("—") for offices (the underlying DB column is non-null).
  grade: optionalTextField,
  teacherName: optionalTextField,
  classroom: optionalTextField,
  cartItems: z.array(orderCartItemSchema).min(1, "Add at least one item to the cart."),
  allergyNotes: optionalTextField,
  dietaryNotes: optionalTextField,
  specialInstructions: optionalTextField,
  // Optional promo code typed by the customer at checkout. Whitespace
  // around it is irrelevant — we trim + uppercase in the engine. Auto
  // discounts apply regardless of this field.
  discountCode: optionalTextField
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const schoolSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  timezone: z.string().min(2),
  defaultCutoffHour: z.coerce.number().int().min(0).max(23),
  defaultCutoffMinute: z.coerce.number().int().min(0).max(59),
  collectTeacher: z.coerce.boolean().default(true),
  collectClassroom: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().default(true)
});

export const menuItemSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional().default(""),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")).transform((v) => v || null),
  basePriceCents: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean().default(true),
  dietaryTags: z.preprocess(
    (v) => {
      if (typeof v !== "string") return [];
      return v.split(",").map((s) => s.trim()).filter(Boolean);
    },
    z.array(z.string()).default([])
  ),
  category: z.string().optional().nullable().or(z.literal("")).transform((v) => v || null),
  // Required top-level choices the customer must pick exactly one of
  // (e.g. Beef / Chicken / Vegan for a Build-Your-Own-Burger). Accepts
  // comma OR newline separation so the same input field works for both
  // single-line CSV and multi-line textareas, and dedupes case-insensitively.
  requiredChoices: z.preprocess(
    (v) => {
      if (typeof v !== "string") return [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const piece of v.split(/[\n,]+/)) {
        const trimmed = piece.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
      }
      return out;
    },
    z.array(z.string()).default([])
  ),
});

export const menuOptionSchema = z.object({
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  optionType: z.enum(["ADD_ON", "REMOVAL"]),
  priceDeltaCents: z.coerce.number().int().min(0).default(0),
  isDefault: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0)
});

export const deliveryDateSchema = z.object({
  schoolId: z.string().min(1),
  deliveryDate: z
    .string()
    .min(1)
    .refine(
      (value) => {
        // Expect a "yyyy-MM-dd" string from the admin <input type="date">
        // control. We accept any calendar day — LunchPad is multi-tenant
        // and different operators have different schedules (offices may
        // run Mon-Fri, weekend caterers serve Sat/Sun, etc.). Operators
        // self-select which days they schedule via the admin UI.
        return /^\d{4}-\d{2}-\d{2}$/.test(value);
      },
      { message: "Delivery date must be in yyyy-MM-dd format." }
    ),
  cutoffAt: z.string().min(1),
  orderingOpen: z.coerce.boolean().default(true),
  notes: z.string().optional().default("")
});
