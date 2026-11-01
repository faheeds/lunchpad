/**
 * Business profile: the single source of truth for "what kind of operator is
 * this?". It is produced by the onboarding questionnaire and drives which
 * onboarding steps appear, which capabilities are switched on, and which
 * words the UI uses (Customer vs Student, Pickup spot vs Classroom, ...).
 *
 * Restaurants without a profile (every tenant created before this feature)
 * keep the legacy behaviour: callers fall back to operatorType-based labels.
 */

import { z } from "zod";

export const AUDIENCES = ["schools", "offices", "groups", "individuals"] as const;
export const FULFILLMENTS = ["pickup", "delivery", "dropoff"] as const;
export const PAYMENT_METHODS = ["card", "zelle", "cash"] as const;
export const VOLUMES = ["under25", "25to100", "100to300", "300plus"] as const;
export const CADENCES = ["everyDay", "setDays", "perEvent"] as const;
export const MENU_SIZES = ["few", "10to25", "import"] as const;
export const TEAM_SIZES = ["solo", "team", "multi"] as const;

export type Audience = (typeof AUDIENCES)[number];
export type Fulfillment = (typeof FULFILLMENTS)[number];
export type PaymentMethodChoice = (typeof PAYMENT_METHODS)[number];

export const questionnaireSchema = z.object({
  audiences: z.array(z.enum(AUDIENCES)).min(1, "Pick at least one"),
  fulfillment: z.array(z.enum(FULFILLMENTS)).min(1, "Pick at least one"),
  payments: z.array(z.enum(PAYMENT_METHODS)).min(1, "Pick at least one"),
  volume: z.enum(VOLUMES),
  cadence: z.enum(CADENCES),
  menuSize: z.enum(MENU_SIZES),
  teamSize: z.enum(TEAM_SIZES),
});

export type QuestionnaireAnswers = z.infer<typeof questionnaireSchema>;

export type Capabilities = {
  servesSchools: boolean;
  servesOffices: boolean;
  servesGroups: boolean;
  servesIndividuals: boolean;
  pickup: boolean;
  delivery: boolean;
  dropoff: boolean;
  cards: boolean;
  zelle: boolean;
  cash: boolean;
};

export type BusinessProfile = {
  version: 1;
  answers: QuestionnaireAnswers;
  capabilities: Capabilities;
};

function uniq<T>(xs: readonly T[]): T[] {
  return Array.from(new Set(xs));
}

export function buildProfile(input: QuestionnaireAnswers): BusinessProfile {
  const answers: QuestionnaireAnswers = {
    ...input,
    audiences: uniq(input.audiences),
    fulfillment: uniq(input.fulfillment),
    payments: uniq(input.payments),
  };
  return {
    version: 1,
    answers,
    capabilities: {
      servesSchools: answers.audiences.includes("schools"),
      servesOffices: answers.audiences.includes("offices"),
      servesGroups: answers.audiences.includes("groups"),
      servesIndividuals: answers.audiences.includes("individuals"),
      pickup: answers.fulfillment.includes("pickup"),
      delivery: answers.fulfillment.includes("delivery"),
      dropoff: answers.fulfillment.includes("dropoff"),
      cards: answers.payments.includes("card"),
      zelle: answers.payments.includes("zelle"),
      cash: answers.payments.includes("cash"),
    },
  };
}

/** Parse the JSON stored on Restaurant.businessProfile. Returns null when absent or invalid. */
export function parseStoredProfile(raw: unknown): BusinessProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const answers = (raw as { answers?: unknown }).answers;
  const parsed = questionnaireSchema.safeParse(answers);
  return parsed.success ? buildProfile(parsed.data) : null;
}

/**
 * Maps a profile onto the legacy Restaurant.operatorType value so existing
 * logic (location defaults, label fallbacks) keeps working unchanged.
 */
export function operatorTypeFor(profile: BusinessProfile): "school" | "office" | "hybrid" | "caterer" {
  const c = profile.capabilities;
  const org = c.servesOffices || c.servesGroups;
  if (c.servesSchools && (org || c.servesIndividuals)) return "hybrid";
  if (c.servesSchools) return "school";
  if (c.servesIndividuals) return "caterer";
  return org ? "office" : "caterer";
}

/** Restaurant column values implied by the answers. */
export function settingsFor(profile: BusinessProfile) {
  const c = profile.capabilities;
  return {
    operatorType: operatorTypeFor(profile),
    acceptZelle: c.zelle,
    acceptCash: c.cash,
    deliveryEnabled: c.delivery,
  };
}

// ─── Vocabulary ─────────────────────────────────────────────────────────────

export type Vocabulary = {
  /** The person being fed: Student / Employee / Customer / Guest. */
  customer: string;
  customerPlural: string;
  customerName: string;
  /** Sub-grouping inside a place; null when the concept does not exist. */
  group: string | null;
  groupPlural: string | null;
  /** Where food is handed over: Classroom / Office / Pickup spot. */
  place: string;
  placePlural: string;
  /** Who places the order on someone's behalf; null when people order for themselves. */
  orderer: string | null;
  ordererPlural: string | null;
  showGrade: boolean;
  showTeacher: boolean;
  showOrdererAccounts: boolean;
};

const SCHOOL_VOCAB: Vocabulary = {
  customer: "Student", customerPlural: "Students", customerName: "Student name",
  group: "Classroom", groupPlural: "Classrooms",
  place: "School", placePlural: "Schools",
  orderer: "Parent", ordererPlural: "Parents",
  showGrade: true, showTeacher: true, showOrdererAccounts: true,
};

const OFFICE_VOCAB: Vocabulary = {
  customer: "Employee", customerPlural: "Employees", customerName: "Employee name",
  group: "Team", groupPlural: "Teams",
  place: "Office", placePlural: "Offices",
  orderer: null, ordererPlural: null,
  showGrade: false, showTeacher: false, showOrdererAccounts: false,
};

const INDIVIDUAL_VOCAB: Vocabulary = {
  customer: "Customer", customerPlural: "Customers", customerName: "Your name",
  group: null, groupPlural: null,
  place: "Pickup spot", placePlural: "Pickup spots",
  orderer: null, ordererPlural: null,
  showGrade: false, showTeacher: false, showOrdererAccounts: false,
};

const MIXED_VOCAB: Vocabulary = {
  customer: "Customer", customerPlural: "Customers", customerName: "Name",
  group: null, groupPlural: null,
  place: "Location", placePlural: "Locations",
  orderer: null, ordererPlural: null,
  showGrade: false, showTeacher: false, showOrdererAccounts: false,
};

export function individualVocabulary(): Vocabulary {
  return INDIVIDUAL_VOCAB;
}

/**
 * Words to use for a restaurant as a whole. Per-location screens should still
 * prefer location-labels.getLabels(); this covers restaurant-wide copy.
 * Mixed operators get school words only inside school flows (callers pass
 * `audience` to ask for a specific one).
 */
export function getVocabulary(
  profile: BusinessProfile | null,
  audience?: Audience,
): Vocabulary {
  if (!profile) return SCHOOL_VOCAB; // legacy tenants
  const c = profile.capabilities;
  if (audience === "schools") return SCHOOL_VOCAB;
  if (audience === "offices" || audience === "groups") return OFFICE_VOCAB;
  if (audience === "individuals") return INDIVIDUAL_VOCAB;
  const kinds = [c.servesSchools, c.servesOffices || c.servesGroups, c.servesIndividuals].filter(Boolean).length;
  if (kinds > 1) return MIXED_VOCAB;
  if (c.servesSchools) return SCHOOL_VOCAB;
  if (c.servesIndividuals) return INDIVIDUAL_VOCAB;
  return OFFICE_VOCAB;
}

// ─── Tailored onboarding plan ───────────────────────────────────────────────

export type PlanStep = {
  key: "profile" | "places" | "menu" | "payments" | "schedule" | "team" | "golive";
  title: string;
  blurb: string;
  minutes: number;
  /** "added" marks steps that replace or extend the default wizard for this operator. */
  tag: "core" | "added" | "optional";
};

export type Plan = {
  steps: PlanStep[];
  skipped: string[];
  totalMinutes: number;
};

export function buildPlan(profile: BusinessProfile): Plan {
  const c = profile.capabilities;
  const a = profile.answers;
  const org = c.servesOffices || c.servesGroups;
  const steps: PlanStep[] = [];
  const skipped: string[] = [];

  steps.push({
    key: "profile",
    title: "Business profile and logo",
    blurb: c.pickup ? "Name, contact and pickup address" : "Name, contact and branding",
    minutes: 3,
    tag: "core",
  });

  // Places: school-flavoured wording only when schools were chosen.
  const placeParts: string[] = [];
  if (c.servesSchools) placeParts.push("schools and classrooms");
  if (c.servesOffices) placeParts.push("offices and teams");
  if (c.servesGroups) placeParts.push("groups and events");
  if (c.pickup) placeParts.push("pickup spots");
  if (c.delivery) placeParts.push("delivery area");
  if (c.dropoff && !c.servesSchools && !org) placeParts.push("drop-off sites");
  steps.push({
    key: "places",
    title: c.servesSchools || org ? "Locations" : "Pickup and delivery",
    blurb: placeParts.length ? `Set up ${placeParts.join(", ")}` : "Where customers get their food",
    minutes: c.servesSchools ? 6 : 5,
    tag: c.servesSchools ? "core" : "added",
  });

  steps.push({
    key: "menu",
    title: "Menu: add your first dishes",
    blurb: a.menuSize === "import" ? "Import your list, then review it" : "Three items to go live",
    minutes: a.menuSize === "few" ? 5 : a.menuSize === "10to25" ? 10 : 8,
    tag: "core",
  });

  if (c.cards) {
    steps.push({
      key: "payments",
      title: c.zelle || c.cash ? "Get paid: cards, plus Zelle or cash" : "Connect Stripe",
      blurb: c.zelle || c.cash ? "Stripe is optional because you also take offline payments" : "Get paid by card, straight to your bank",
      minutes: 6,
      tag: c.zelle || c.cash ? "optional" : "core",
    });
  } else {
    steps.push({
      key: "payments",
      title: c.zelle ? "Set up Zelle" + (c.cash ? " and cash" : "") : "Set up cash payments",
      blurb: "Add payment instructions customers see after ordering",
      minutes: 3,
      tag: "added",
    });
    skipped.push("Stripe Connect");
  }

  steps.push({
    key: "schedule",
    title: a.cadence === "perEvent" ? "Event dates and cutoff" : "Order days and cutoff time",
    blurb: a.cadence === "everyDay" ? "Open every day you serve" : a.cadence === "perEvent" ? "Create a date for each event" : "Pick the days you cook each week",
    minutes: 4,
    tag: "core",
  });

  if (a.teamSize !== "solo") {
    steps.push({
      key: "team",
      title: "Invite your team",
      blurb: a.teamSize === "multi" ? "Add managers for each location" : "Give staff access to orders and the kitchen sheet",
      minutes: 3,
      tag: "added",
    });
  } else {
    skipped.push("Team logins");
  }

  steps.push({
    key: "golive",
    title: "Place a test order and go live",
    blurb: c.zelle || c.cash ? "Includes a quick 'mark as paid' walkthrough" : "Share your link when you're ready",
    minutes: 4,
    tag: "core",
  });

  // Never mention school concepts to operators who did not pick schools; the
  // skipped list is only for things the operator might expect to see.
  if (a.menuSize !== "import") skipped.push("Bulk menu import");

  return {
    steps,
    skipped,
    totalMinutes: steps.reduce((n, s) => n + s.minutes, 0),
  };
}
