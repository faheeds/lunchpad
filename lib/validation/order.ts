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
  grade: z.string().min(1),
  teacherName: optionalTextField,
  classroom: optionalTextField,
  cartItems: z.array(orderCartItemSchema).min(1, "Add at least one item to the cart."),
  allergyNotes: optionalTextField,
  dietaryNotes: optionalTextField,
  specialInstructions: optionalTextField
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
  basePriceCents: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean().default(true)
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
        // Expect a "yyyy-MM-dd" string from the admin <input type="date"> control.
        // Reject weekend dates — this is a school-lunch app, no deliveries Sat/Sun.
        // Parse as a local calendar date (not UTC) so the day-of-week matches what
        // the admin saw when they picked the date.
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return false;
        const [, y, m, d] = match;
        const local = new Date(Number(y), Number(m) - 1, Number(d));
        const dow = local.getDay(); // 0=Sun, 5=Fri, 6=Sat
        return dow >= 1 && dow <= 4; // Monday–Thursday only
      },
      { message: "Delivery date must be Monday–Thursday (no Friday or weekend deliveries)." }
    ),
  cutoffAt: z.string().min(1),
  orderingOpen: z.coerce.boolean().default(true),
  notes: z.string().optional().default("")
});
