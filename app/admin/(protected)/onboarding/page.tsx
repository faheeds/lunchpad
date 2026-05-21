import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant, requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { slugify } from "@/lib/utils";
import { ImageUpload } from "@/components/admin/image-upload";
import { ThemePicker } from "@/components/admin/theme-picker";
import { LiveBrandingPreview } from "@/components/admin/live-branding-preview";
import { CopyUrlButton } from "@/components/admin/copy-url-button";
import { WizardStepper, type WizardStep } from "@/components/admin/wizard-stepper";

export const dynamic = "force-dynamic";

// ─── Server actions ─────────────────────────────────────────────────────────

async function saveOperatorType(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  const operatorType = String(formData.get("operatorType") || "").trim();
  if (!["school", "office", "hybrid"].includes(operatorType)) {
    redirect("/admin/onboarding?step=1&error=invalid");
  }

  // Capture support contact info on the same step. These are the email +
  // phone that get rendered into customer-facing transactional emails and
  // the parent ordering page footer, so it's important they're set early.
  const contactEmail = String(formData.get("contactEmail") || "").trim() || null;
  const contactPhone = String(formData.get("contactPhone") || "").trim() || null;

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    redirect("/admin/onboarding?step=1&error=invalid_email");
  }

  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { operatorType, contactEmail, contactPhone },
  });
  redirect("/admin/onboarding?step=2");
}

async function saveBranding(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      logoUrl:         (String(formData.get("logoUrl") || "").trim() || null),
      heroImageUrl:    (String(formData.get("heroImageUrl") || "").trim() || null),
      primaryColor:    String(formData.get("primaryColor") || "#c41230").trim(),
      accentColor:     String(formData.get("accentColor") || "#f59e0b").trim(),
      darkColor:       String(formData.get("darkColor") || "#1c0505").trim(),
      heroTitleColor:  String(formData.get("heroTitleColor") || "#ffffff").trim(),
      heroAccentColor: String(formData.get("heroAccentColor") || "#fbbf24").trim(),
      bodyTextColor:   String(formData.get("bodyTextColor") || "#1c0505").trim(),
      displayFont:     String(formData.get("displayFont") || "Oswald").trim(),
      bodyFont:        String(formData.get("bodyFont") || "Inter").trim(),
    },
  });
  redirect("/admin/onboarding?step=3");
}

async function createFirstLocation(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  const name = String(formData.get("name") || "").trim();
  const locationType = String(formData.get("locationType") || "SCHOOL") === "OFFICE" ? "OFFICE" : "SCHOOL";
  const timezone = String(formData.get("timezone") || "America/Los_Angeles");
  const cutoffTime = String(formData.get("cutoffTime") || "21:00");
  const [hourStr, minStr] = cutoffTime.split(":");

  if (!name) redirect("/admin/onboarding?step=4&error=name_required");

  const existing = await prisma.school.count({
    where: { restaurantId: restaurant.id, name },
  });
  if (existing === 0) {
    await prisma.school.create({
      data: {
        restaurantId: restaurant.id,
        name,
        slug: slugify(name),
        locationType,
        timezone,
        defaultCutoffHour: parseInt(hourStr ?? "21", 10),
        defaultCutoffMinute: parseInt(minStr ?? "0", 10),
        collectTeacher: locationType === "SCHOOL",
        collectClassroom: locationType === "SCHOOL",
        isActive: true,
      },
    });
  }
  redirect("/admin/onboarding?step=5");
}

async function generateRecurringForWizard(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const schoolId = String(formData.get("schoolId") || "");
  const startDateStr = String(formData.get("startDate") || "");
  const endDateStr = String(formData.get("endDate") || "");
  const weekdays = formData.getAll("weekdays").map((v) => parseInt(String(v), 10)).filter((n) => !isNaN(n));
  const cutoffDaysBefore = parseInt(String(formData.get("cutoffDaysBefore") || "1"), 10);
  const cutoffHour = parseInt(String(formData.get("cutoffHour") || "9"), 10);

  if (!schoolId || !startDateStr || !endDateStr || weekdays.length === 0) {
    redirect("/admin/onboarding?step=6&error=missing_fields");
  }

  const school = await prisma.school.findFirst({
    where: { id: schoolId, restaurantId: restaurant.id },
    select: { timezone: true },
  });
  if (!school) redirect("/admin/onboarding?step=6&error=invalid_location");

  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  if (end < start) redirect("/admin/onboarding?step=6&error=invalid_range");

  const activeMenuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true, schoolRestrictions: { select: { schoolId: true } } },
  });
  const eligibleMenuItems = activeMenuItems.filter(
    (item) =>
      item.schoolRestrictions.length === 0 ||
      item.schoolRestrictions.some((r) => r.schoolId === schoolId)
  );

  const targetWeekdays = new Set(weekdays);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!targetWeekdays.has(d.getUTCDay())) continue;
    const ymd = d.toISOString().slice(0, 10);
    const cutoffWalk = new Date(d);
    cutoffWalk.setUTCDate(cutoffWalk.getUTCDate() - cutoffDaysBefore);
    const cutoffYmd = cutoffWalk.toISOString().slice(0, 10);
    const hh = String(cutoffHour).padStart(2, "0");

    try {
      const created = await prisma.deliveryDate.create({
        data: {
          schoolId,
          deliveryDate: fromZonedTime(`${ymd} 11:00:00`, school!.timezone),
          cutoffAt: fromZonedTime(`${cutoffYmd} ${hh}:00:00`, school!.timezone),
          orderingOpen: true,
        },
      });
      if (eligibleMenuItems.length > 0) {
        await prisma.deliveryMenuItem.createMany({
          data: eligibleMenuItems.map((m) => ({
            deliveryDateId: created.id,
            menuItemId: m.id,
            schoolId,
            isAvailable: true,
          })),
          skipDuplicates: true,
        });
      }
    } catch {
      // duplicate — skip
    }
  }

  revalidatePath("/admin/onboarding");
  redirect("/admin/onboarding?step=7");
}

async function saveNotifications(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  const raw = formData.get("kitchenSheetSendHour");
  const kitchenSheetSendHour = raw === "" || raw === null ? null : Number(raw);
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { kitchenSheetSendHour },
  });
  redirect("/admin/onboarding?step=10");
}

async function markTestOrderPlaced() {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { testOrderPlacedAt: new Date() },
  });
  redirect("/admin/onboarding?step=9");
}

async function launchAndComplete() {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { onboardingShareAcked: true, onboardingComplete: true },
  });
  redirect("/admin/dashboard");
}

async function seedSampleData() {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const { SAMPLE_SCHOOL_NAME, SAMPLE_MENU_ITEMS } = await import("@/lib/sample-data");

  // Create sample school
  const school = await prisma.school.create({
    data: {
      restaurantId: restaurant.id,
      name: SAMPLE_SCHOOL_NAME,
      slug: slugify(SAMPLE_SCHOOL_NAME),
      locationType: "SCHOOL",
      timezone: restaurant.timezone || "America/Los_Angeles",
      defaultCutoffHour: 17,
      defaultCutoffMinute: 0,
      collectTeacher: true,
      collectClassroom: true,
      isActive: true,
    },
  });

  // Create sample menu items
  const menuItems = await Promise.all(
    SAMPLE_MENU_ITEMS.map((item) =>
      prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          name: item.name,
          slug: slugify(item.name),
          basePriceCents: item.price,
          isActive: true,
        },
      })
    )
  );

  // Create a delivery date for next Friday at 11am
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  const nextFriday = new Date(today);
  nextFriday.setDate(nextFriday.getDate() + daysUntilFriday);

  const deliveryDate = await prisma.deliveryDate.create({
    data: {
      schoolId: school.id,
      deliveryDate: fromZonedTime(
        `${nextFriday.toISOString().slice(0, 10)} 11:00:00`,
        school.timezone
      ),
      cutoffAt: fromZonedTime(
        `${nextFriday.toISOString().slice(0, 10)} 10:00:00`,
        school.timezone
      ),
      orderingOpen: true,
    },
  });

  // Link menu items to the delivery date
  await prisma.deliveryMenuItem.createMany({
    data: menuItems.map((m) => ({
      deliveryDateId: deliveryDate.id,
      menuItemId: m.id,
      schoolId: school.id,
      isAvailable: true,
    })),
  });

  // Mark onboarding complete and reset test order nudge
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      onboardingComplete: true,
      testOrderPlacedAt: null,
    },
  });

  revalidatePath("/admin/dashboard");
  redirect("/admin/dashboard");
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)"  },
];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  // If we're on the apex (no x-restaurant-slug header) but the operator is
  // signed in to a real tenant, send them to their subdomain. The wizard
  // is much more reliable when the middleware has set the slug header,
  // because the layout, server actions, and revalidation paths all assume
  // a single canonical host. Without this, RSC fetches loop while the
  // session-fallback resolves restaurant context.
  const headerList = await headers();
  const slugHeader = headerList.get("x-restaurant-slug");
  if (!slugHeader) {
    const subdomainRestaurant = await getCurrentRestaurant();
    if (!subdomainRestaurant) {
      // Fall back to session — find the operator's restaurant via requireRestaurant().
      const sessionRestaurant = await requireRestaurant();
      const params = await searchParams;
      const qs = new URLSearchParams();
      if (params.step) qs.set("step", String(params.step));
      const suffix = qs.toString();
      redirect(`https://${sessionRestaurant.slug}.lunchpad.us/admin/onboarding${suffix ? `?${suffix}` : ""}`);
    }
  }

  const [params, restaurant] = await Promise.all([
    searchParams,
    requireRestaurant(),
  ]);
  await requireAdminRole("OWNER");

  const [locationCount, menuItemCount, deliveryDateCount, teamCount, schools] = await Promise.all([
    prisma.school.count({ where: { restaurantId: restaurant.id, isActive: true } }),
    prisma.menuItem.count({ where: { restaurantId: restaurant.id, isActive: true } }),
    prisma.deliveryDate.count({
      where: { school: { restaurantId: restaurant.id }, deliveryDate: { gte: new Date() } },
    }),
    prisma.adminUser.count({ where: { restaurantId: restaurant.id } }),
    prisma.school.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      select: { id: true, name: true, locationType: true, timezone: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
  ]);

  // Step status detection (10 steps total — share + launch are one combined final step)
  const status = {
    1: restaurant.operatorType ? "done" : "todo",
    2: restaurant.logoUrl || restaurant.heroImageUrl ? "done" : "todo",
    3: restaurant.stripeOnboardingComplete ? "done" : "todo",
    4: locationCount > 0 ? "done" : "todo",
    5: menuItemCount >= 3 ? "done" : "todo",
    6: deliveryDateCount > 0 ? "done" : "todo",
    7: teamCount > 1 ? "done" : "todo",
    8: restaurant.testOrderPlacedAt ? "done" : "todo",
    9: restaurant.kitchenSheetSendHour !== null && restaurant.kitchenSheetSendHour !== undefined ? "done" : "todo",
    10: restaurant.onboardingComplete ? "done" : "todo",
  } as const;

  const orderingUrl = `https://${restaurant.slug}.lunchpad.us`;

  // Determine active step: explicit ?step=, else first non-done step.
  const requestedStep = params.step ? parseInt(params.step, 10) : NaN;
  const firstTodoStep =
    (Object.entries(status).find(([, s]) => s !== "done")?.[0] as string | undefined) ?? "10";
  const activeStep =
    requestedStep && requestedStep >= 1 && requestedStep <= 10
      ? requestedStep
      : parseInt(firstTodoStep, 10);

  // Stepper display is condensed from 10 sub-steps into 5 logical
  // groups so the operator sees 5 dots instead of 10. The URL routing
  // and server actions still use the original sub-step numbers 1-10.
  // Group → sub-step mapping:
  //   About you           → 1 (type) + 2 (branding)
  //   Connect Stripe      → 3
  //   Menu & locations    → 4 (location) + 5 (menu)
  //   Delivery schedule   → 6
  //   Go live             → 7 (team) + 8 (test) + 9 (notify) + 10 (share)
  // `status` has numeric-literal keys (1..10) so indexing with arbitrary number
  // is too wide for TS. Cast to Record once and reuse — runtime unchanged.
  const statusByNum = status as Record<number, "done" | "todo">;
  const isDone = (n: number) => statusByNum[n] === "done";
  const allDone = (nums: number[]) => nums.every(isDone);
  const isCurrent = (nums: number[]) => nums.includes(activeStep);
  const groupStatus = (nums: number[]) =>
    allDone(nums) ? "done" as const :
    isCurrent(nums) ? "current" as const :
    "todo" as const;

  const steps: WizardStep[] = [
    { id: 1,  title: "About you",          blurb: "Operator type + branding",      status: groupStatus([1, 2]) },
    { id: 3,  title: "Connect Stripe",     blurb: "Get paid by customers",          status: groupStatus([3]) },
    { id: 4,  title: "Menu & locations",   blurb: "What you sell, where",           status: groupStatus([4, 5]) },
    { id: 6,  title: "Delivery schedule",  blurb: "When you deliver",               status: groupStatus([6]) },
    { id: 7,  title: "Go live",            blurb: "Team, test order, share — finish at your pace", status: groupStatus([7, 8, 9, 10]) },
  ];

  // Map the actual activeStep (1-10) to its group head so the stepper
  // highlights the right row when the user is on a sub-step.
  const groupHeadFor = (n: number) =>
    n <= 2 ? 1 : n === 3 ? 3 : n <= 5 ? 4 : n === 6 ? 6 : 7;
  const displayActiveStep = groupHeadFor(activeStep);

  return (
    <div className="bg-editorial-paper min-h-screen space-y-5 pb-10">
      <div>
        <h1 className="text-[20px] font-editorial font-semibold text-editorial-ink">Welcome — let&apos;s get you live</h1>
        <p className="text-[12px] text-editorial-ink-soft mt-1">
          We&apos;ll walk you through the essentials. Each step is skippable and you can come back any time.
        </p>
      </div>

      {params.error && (
        <div className="rounded-[12px] bg-[#F4E3DB] border border-[#E2C3B3] px-4 py-3">
          <p className="text-[12px] text-[#7C3D24]">
            {params.error === "name_required" ? "Please enter a location name." :
             params.error === "invalid_email" ? "That doesn't look like a valid email address." :
             params.error === "missing_fields" ? "Please fill in the date range, weekdays, and cutoff." :
             params.error === "invalid_range" ? "End date must be after start date." :
             params.error === "invalid_location" ? "Couldn't find that location." :
             "Something went wrong — please try again."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        <aside className="lg:sticky lg:top-4">
          <WizardStepper steps={steps} activeStepId={displayActiveStep} />
        </aside>

        <main>
          {/* ── STEP 1: Operator type ───────────────────────────── */}
          {(activeStep === 1 || activeStep === 2) && (
            <form action={saveOperatorType} className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 1 of 5 · About you · Choose type</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">What kind of operation are you?</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">We&apos;ll seed sensible defaults for you. You can change this later.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { value: "school",  label: "School caterer",    blurb: "Lunches for K-12 schools. Students, classrooms, allergy notes." },
                  { value: "office",  label: "Corporate cafeteria", blurb: "Meals for office buildings. Employees, teams, recurring orders." },
                  { value: "hybrid",  label: "Both",                blurb: "You serve schools and offices. Defaults won't auto-pick either." },
                ].map((opt) => (
                  <label key={opt.value}
                    className="cursor-pointer rounded-[14px] border border-editorial-line bg-white p-4 has-[:checked]:bg-editorial-paper-2 has-[:checked]:border-editorial-green transition">
                    <input type="radio" name="operatorType" value={opt.value} required defaultChecked={restaurant.operatorType === opt.value} className="sr-only" />
                    <p className="text-[13px] font-semibold text-editorial-ink">{opt.label}</p>
                    <p className="text-[11px] text-editorial-ink-soft mt-1.5 leading-relaxed">{opt.blurb}</p>
                  </label>
                ))}
              </div>

              {/* Support contact — used in transactional emails & ordering page footer.
                  Contact email is pre-filled from signup; phone is new info. */}
              <div className="border-t border-editorial-line pt-4 mt-2 space-y-3">
                <div>
                  <p className="text-[12px] font-semibold text-editorial-ink">Customer support contact</p>
                  <p className="text-[11px] text-editorial-ink-soft mt-0.5 leading-relaxed">
                    These appear in your customers&apos; order confirmation emails and on your ordering page footer
                    so they know where to reach you with questions.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">Support email</label>
                    <input
                      type="email"
                      name="contactEmail"
                      defaultValue={restaurant.contactEmail ?? ""}
                      placeholder="orders@yourrestaurant.com"
                      className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">
                      Support phone <span className="text-editorial-ink-faint font-normal">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      name="contactPhone"
                      defaultValue={restaurant.contactPhone ?? ""}
                      placeholder="+1 (555) 123-4567"
                      className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                    />
                  </div>
                </div>
              </div>

              {/* Nested <form>s aren't allowed in HTML. Browsers silently
                  un-nest them, which makes React's hydration check fail
                  against the server-rendered HTML (error #418 — wizard
                  renders blank + auto-refreshes). Using `formAction` on
                  the submit button is the HTML5 way to override the
                  parent form's action for a single button — no nesting.
                  seedSampleData ignores formData, so the outer form's
                  fields tagging along is harmless. */}
              <div className="flex items-center justify-between pt-2 gap-3">
                <button type="submit" formAction={seedSampleData} className="px-4 py-2.5 rounded-full border border-editorial-line text-editorial-ink text-[13px] font-semibold hover:border-editorial-green hover:text-editorial-green transition">
                  Skip for now
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 2: Branding ─────────────────────────────────── */}
          {(activeStep === 1 || activeStep === 2) && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              <form id="onboarding-branding-form" action={saveBranding} className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 1 of 5 · About you · Set branding</p>
                  <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Make it yours</h2>
                  <p className="text-[12px] text-editorial-ink-soft mt-1">Watch the preview update as you change things.</p>
                </div>

                <input type="hidden" name="name" value={restaurant.name} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="max-w-[160px]">
                    <ImageUpload name="logoUrl" defaultValue={restaurant.logoUrl} label="Logo" aspect="square" hint="Square works best." />
                  </div>
                  <div>
                    <ImageUpload name="heroImageUrl" defaultValue={restaurant.heroImageUrl} label="Hero image" aspect="wide" hint="A wide, appetizing food photo." />
                  </div>
                </div>

                <div className="border-t border-editorial-line pt-4">
                  <p className="text-[12px] font-semibold text-editorial-ink mb-3">Theme</p>
                  <ThemePicker
                    currentPrimary={restaurant.primaryColor     ?? "#c41230"}
                    currentAccent={restaurant.accentColor       ?? "#f59e0b"}
                    currentDark={restaurant.darkColor           ?? "#1c0505"}
                    currentHeroTitle={restaurant.heroTitleColor  ?? "#ffffff"}
                    currentHeroAccent={restaurant.heroAccentColor ?? "#fbbf24"}
                    currentBodyText={restaurant.bodyTextColor    ?? "#1c0505"}
                    currentDisplayFont={restaurant.displayFont   ?? "Oswald"}
                    currentBodyFont={restaurant.bodyFont         ?? "Inter"}
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Link href="/admin/onboarding?step=1" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                  <button type="submit" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                    Save & continue →
                  </button>
                </div>
              </form>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint mb-2">Live preview</p>
                <LiveBrandingPreview
                  formId="onboarding-branding-form"
                  initial={{
                    name: restaurant.name,
                    logoUrl: restaurant.logoUrl ?? "",
                    heroImageUrl: restaurant.heroImageUrl ?? "",
                    primaryColor: restaurant.primaryColor ?? "#c41230",
                    accentColor: restaurant.accentColor ?? "#f59e0b",
                    darkColor: restaurant.darkColor ?? "#1c0505",
                    heroTitleColor: restaurant.heroTitleColor ?? "#ffffff",
                    heroAccentColor: restaurant.heroAccentColor ?? "#fbbf24",
                    bodyTextColor: restaurant.bodyTextColor ?? "#1c0505",
                    displayFont: restaurant.displayFont ?? "Oswald",
                    bodyFont: restaurant.bodyFont ?? "Inter",
                  }}
                />
              </div>
            </div>
          )}

          {/* ── STEP 3: Stripe Connect ───────────────────────────── */}
          {activeStep === 3 && (
            <div className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 2 of 5 · Connect Stripe</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Connect Stripe so customers can pay you</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">
                  Customer payments go directly to your Stripe account. LunchPad takes a small platform fee automatically.
                </p>
              </div>

              {restaurant.stripeOnboardingComplete && restaurant.stripeAccountId ? (
                <div className="bg-editorial-sage border border-editorial-sage rounded-lg px-4 py-3 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2C4031" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  <p className="text-[12px] font-semibold text-editorial-green">Stripe connected — you&apos;re ready to take payments.</p>
                </div>
              ) : (
                <div className="bg-[#F6EED9] border border-[#E5D6A8] rounded-lg px-4 py-3">
                  <p className="text-[12px] text-[#6E5C2C]">No Stripe account connected yet. Without this, customers can browse but can&apos;t check out.</p>
                </div>
              )}

              <a
                href="/api/stripe/connect/authorize"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white no-underline hover:opacity-90 transition"
                style={{ background: "linear-gradient(135deg, #635bff, #4f46e5)" }}
              >
                {restaurant.stripeOnboardingComplete ? "Reconnect Stripe →" : "Connect Stripe →"}
              </a>

              <div className="flex items-center justify-between pt-2">
                <Link href="/admin/onboarding?step=2" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <Link href="/admin/onboarding?step=4" className="text-[12px] text-editorial-green font-semibold no-underline hover:text-editorial-green-deep">
                  {restaurant.stripeOnboardingComplete ? "Continue →" : "Skip for now →"}
                </Link>
              </div>
            </div>
          )}

          {/* ── STEP 4: First location ───────────────────────────── */}
          {(activeStep === 4 || activeStep === 5) && (
            <form action={createFirstLocation} className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 3 of 5 · Menu & locations · Add a location</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Add your first location</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">
                  {locationCount > 0
                    ? `You already have ${locationCount} location${locationCount === 1 ? "" : "s"}. Add another below or continue.`
                    : "Pick a name, type, and timezone. You can add more locations later."}
                </p>
              </div>

              <div>
                <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-editorial-line bg-white px-3 py-2.5 has-[:checked]:bg-editorial-paper-2 has-[:checked]:border-editorial-green transition">
                    <input type="radio" name="locationType" value="SCHOOL" defaultChecked={restaurant.operatorType !== "office"} className="mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-editorial-ink">School</p>
                      <p className="text-[10px] text-editorial-ink-faint">Students, classrooms, teachers</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-editorial-line bg-white px-3 py-2.5 has-[:checked]:bg-editorial-paper-2 has-[:checked]:border-editorial-green transition">
                    <input type="radio" name="locationType" value="OFFICE" defaultChecked={restaurant.operatorType === "office"} className="mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-editorial-ink">Office</p>
                      <p className="text-[10px] text-editorial-ink-faint">Employees, teams, floors</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Location name</label>
                  <input type="text" name="name" required placeholder="HQ — Main Office"
                    className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                </div>
                <div>
                  <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Timezone</label>
                  <select name="timezone" defaultValue={restaurant.timezone || "America/Los_Angeles"}
                    className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Default ordering cutoff</label>
                <input type="time" name="cutoffTime" defaultValue="21:00" required
                  className="w-full sm:max-w-[200px] rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                <p className="text-[10px] text-editorial-ink-faint mt-1">The time the night before delivery when ordering closes.</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Link href="/admin/onboarding?step=3" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <div className="flex gap-2">
                  {locationCount > 0 && (
                    <Link href="/admin/onboarding?step=5" className="px-4 py-2 rounded-full border border-editorial-line text-[13px] font-semibold text-editorial-ink no-underline hover:border-editorial-green hover:text-editorial-green transition">
                      Skip →
                    </Link>
                  )}
                  <button type="submit" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                    Add location →
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ── STEP 5: Menu items ───────────────────────────────── */}
          {(activeStep === 4 || activeStep === 5) && (
            <div className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 3 of 5 · Menu & locations · Build menu</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Build your menu</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">
                  You currently have <strong>{menuItemCount}</strong> active item{menuItemCount === 1 ? "" : "s"}. We recommend at least 3 to launch.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Link href="/admin/menu" className="block rounded-[14px] border border-editorial-line bg-white p-4 no-underline hover:border-editorial-green hover:bg-editorial-paper-2 transition">
                  <p className="text-[13px] font-semibold text-editorial-ink">Add manually</p>
                  <p className="text-[11px] text-editorial-ink-soft mt-1.5 leading-relaxed">Add items one by one with photos, prices, and dietary tags.</p>
                </Link>
                <Link href="/admin/menu" className="block rounded-[14px] border border-editorial-line bg-white p-4 no-underline hover:border-editorial-green hover:bg-editorial-paper-2 transition">
                  <p className="text-[13px] font-semibold text-editorial-ink">Bulk upload Excel</p>
                  <p className="text-[11px] text-editorial-ink-soft mt-1.5 leading-relaxed">Download our template, fill it in, drop it back. Fast for 20+ items.</p>
                </Link>
                <Link href="/admin/menu" className="block rounded-[14px] border border-editorial-line bg-white p-4 no-underline hover:border-editorial-green hover:bg-editorial-paper-2 transition">
                  <p className="text-[13px] font-semibold text-editorial-ink">AI categorize</p>
                  <p className="text-[11px] text-editorial-ink-soft mt-1.5 leading-relaxed">Paste a list, we&apos;ll suggest categories, prices, and tags.</p>
                </Link>
                <Link href="/admin/menu" className="block rounded-[14px] border border-editorial-clay bg-white p-4 no-underline hover:border-editorial-clay hover:bg-editorial-paper-2 transition" style={{ position: "relative" }}>
                  <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#DEE2CF", color: "#2C4031", border: "1px solid #2C4031" }}>Fastest</span>
                  <p className="text-[13px] font-semibold text-editorial-ink">Import from URL</p>
                  <p className="text-[11px] text-editorial-ink-soft mt-1.5 leading-relaxed">Paste your existing menu page URL. We&apos;ll extract items, prices, photos, and add-ons automatically.</p>
                </Link>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Link href="/admin/onboarding?step=4" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <Link href="/admin/onboarding?step=6"
                  className={`px-5 py-2.5 rounded-full text-[13px] font-semibold no-underline transition ${
                    menuItemCount >= 3 ? "bg-editorial-green text-editorial-paper hover:bg-editorial-green-deep" : "border border-editorial-line text-editorial-ink hover:border-editorial-green hover:text-editorial-green"
                  }`}>
                  {menuItemCount >= 3 ? "Continue →" : "Skip for now →"}
                </Link>
              </div>
            </div>
          )}

          {/* ── STEP 6: Recurring schedule ───────────────────────── */}
          {activeStep === 6 && (
            <form action={generateRecurringForWizard} className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 4 of 5 · Delivery schedule</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Generate a recurring schedule</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">Pick a date range and weekday pattern. We&apos;ll create the dates and auto-attach your menu items.</p>
              </div>

              {schools.length === 0 ? (
                <div className="bg-[#F6EED9] border border-[#E5D6A8] rounded-lg px-4 py-3">
                  <p className="text-[12px] text-[#6E5C2C]">Add a location first (step 4) before generating a schedule.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Location</label>
                    <select name="schoolId" required
                      className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">From</label>
                      <input type="date" name="startDate" required
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                    </div>
                    <div>
                      <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Through</label>
                      <input type="date" name="endDate" required
                        defaultValue={new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                        className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">On these weekdays</label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {[
                        { v: 1, l: "Mon", on: true  },
                        { v: 2, l: "Tue", on: false },
                        { v: 3, l: "Wed", on: true  },
                        { v: 4, l: "Thu", on: false },
                        { v: 5, l: "Fri", on: true  },
                        { v: 6, l: "Sat", on: false },
                        { v: 0, l: "Sun", on: false },
                      ].map((d) => (
                        <label key={d.v}
                          className="flex flex-col items-center justify-center cursor-pointer rounded-lg border border-editorial-line bg-white py-2 has-[:checked]:bg-editorial-green has-[:checked]:text-editorial-paper has-[:checked]:border-editorial-green transition">
                          <input type="checkbox" name="weekdays" value={d.v} defaultChecked={d.on} className="sr-only" />
                          <span className="text-[11px] font-semibold">{d.l}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Cutoff</label>
                      <select name="cutoffDaysBefore" defaultValue="1"
                        className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                        <option value="0">Same day</option>
                        <option value="1">1 day before</option>
                        <option value="2">2 days before</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Cutoff hour</label>
                      <select name="cutoffHour" defaultValue="9"
                        className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-2">
                <Link href="/admin/onboarding?step=5" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <div className="flex gap-2">
                  <Link href="/admin/onboarding?step=7" className="px-4 py-2 rounded-full border border-editorial-line text-[13px] font-semibold text-editorial-ink no-underline hover:border-editorial-green hover:text-editorial-green transition">
                    Skip →
                  </Link>
                  {schools.length > 0 && (
                    <button type="submit" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                      Generate dates →
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

          {/* ── STEP 7: Invite team ──────────────────────────────── */}
          {(activeStep >= 7 && activeStep <= 10) && (
            <div className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 5 of 5 · Go live · Invite team (optional)</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Invite your team</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">
                  You currently have <strong>{teamCount}</strong> team member{teamCount === 1 ? "" : "s"}.
                  Add co-owners or staff so they can help manage orders.
                </p>
              </div>

              <Link href="/admin/team" className="inline-block px-4 py-2 rounded-lg bg-editorial-green-deep text-editorial-paper text-[12px] font-semibold no-underline hover:opacity-90 transition">
                Open Team page →
              </Link>

              <div className="flex items-center justify-between pt-2">
                <Link href="/admin/onboarding?step=6" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <Link href="/admin/onboarding?step=8" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold no-underline hover:bg-editorial-green-deep transition">
                  Continue →
                </Link>
              </div>
            </div>
          )}

          {/* ── STEP 8: Test order ───────────────────────────────── */}
          {(activeStep >= 7 && activeStep <= 10) && (
            <div className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 5 of 5 · Go live · Place a test order</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Place a test order</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">
                  Open your customer ordering page in a new tab. Place a real order — use a $0.50 menu item or your real card; you&apos;ll refund yourself in a click. This is the moment you&apos;ll feel confident sharing the URL with customers.
                </p>
              </div>

              <div className="rounded-lg bg-editorial-paper-2 border border-editorial-line px-4 py-3 flex items-center gap-3 flex-wrap">
                <p className="text-[12px] font-mono text-editorial-ink flex-1 min-w-0 truncate">{orderingUrl}</p>
                <CopyUrlButton url={orderingUrl} />
                <a href={orderingUrl} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-editorial-green text-editorial-paper text-[11px] font-semibold no-underline hover:bg-editorial-green-deep transition">
                  Open ↗
                </a>
              </div>

              <div className="bg-[#F6EED9] border border-[#E5D6A8] rounded-lg px-4 py-3 space-y-1">
                <p className="text-[11px] font-semibold text-[#6E5C2C]">Quick checklist while you test:</p>
                <ul className="text-[11px] text-[#6E5C2C] list-disc pl-5 space-y-0.5">
                  <li>Does the hero image and color scheme look right?</li>
                  <li>Can you add a menu item to your cart?</li>
                  <li>Does Stripe checkout actually charge your card?</li>
                  <li>Did you get the confirmation email?</li>
                  <li>Does the order appear in your admin Orders list?</li>
                </ul>
              </div>

              <form action={markTestOrderPlaced} className="flex items-center justify-between pt-2">
                <Link href="/admin/onboarding?step=7" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <button type="submit" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                  I placed a test order — continue →
                </button>
              </form>
            </div>
          )}

          {/* ── STEP 9: Notifications ────────────────────────────── */}
          {(activeStep >= 7 && activeStep <= 10) && (
            <form action={saveNotifications} className="rounded-[16px] border border-editorial-line bg-white p-5 space-y-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 5 of 5 · Go live · Notifications (optional)</p>
                <h2 className="text-[18px] font-editorial font-semibold text-editorial-ink mt-1">Notification preferences</h2>
                <p className="text-[12px] text-editorial-ink-soft mt-1">
                  Auto-email the kitchen prep sheet on each delivery day. You can change this any time in Settings → Notifications.
                </p>
              </div>

              <div>
                <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">
                  Auto-send kitchen sheet at <span className="font-normal text-editorial-ink-faint">(in your timezone)</span>
                </label>
                <select name="kitchenSheetSendHour"
                  defaultValue={restaurant.kitchenSheetSendHour ?? ""}
                  className="w-full sm:max-w-[300px] rounded-lg border border-editorial-line text-[13px] px-3 py-2 text-editorial-ink focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                  <option value="">Disabled — I'll send it manually</option>
                  {Array.from({ length: 24 }, (_, h) => {
                    const label = h === 0 ? "12:00 AM (midnight)" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM (noon)" : `${h - 12}:00 PM`;
                    return <option key={h} value={h}>{label}</option>;
                  })}
                </select>
                <p className="text-[11px] text-editorial-ink-faint mt-1.5">
                  Sent to your contact email once per delivery day. Set a contact email under Settings → General if you haven&apos;t.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Link href="/admin/onboarding?step=8" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <button type="submit" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                  Save & continue →
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 10 (FINAL): Share & launch ────────────────── */}
          {(activeStep >= 7 && activeStep <= 10) && (
            <div className="rounded-[16px] border border-editorial-green bg-gradient-to-br from-editorial-sage/40 to-editorial-sage/20 p-6 space-y-5 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <div>
                <div className="w-12 h-12 rounded-full bg-editorial-green flex items-center justify-center mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">Step 5 of 5 · Go live · Share & launch — last one!</p>
                <h2 className="text-[22px] font-editorial font-semibold text-editorial-ink mt-1">You&apos;re ready to launch.</h2>
                <p className="text-[13px] text-editorial-ink-soft mt-1">
                  Share the URL below with your customers, then click <strong>Launch</strong> when you&apos;re done.
                  You can change anything later from your dashboard.
                </p>
              </div>

              <div className="rounded-lg bg-white border border-editorial-line px-4 py-3 flex items-center gap-3 flex-wrap">
                <p className="text-[13px] font-mono text-editorial-ink flex-1 min-w-0 truncate font-semibold">{orderingUrl}</p>
                <CopyUrlButton url={orderingUrl} />
              </div>

              <div className="space-y-2">
                <details className="rounded-lg border border-editorial-line bg-white">
                  <summary className="px-4 py-2.5 text-[12px] font-semibold text-editorial-ink cursor-pointer">📧 Email template (click to expand)</summary>
                  <div className="px-4 pb-3 border-t border-editorial-line pt-2">
                    <pre className="text-[11px] text-editorial-ink-soft whitespace-pre-wrap font-mono leading-relaxed">{`Hi everyone,

We're excited to share our online lunch ordering page!

Browse the menu and place an order at:
${orderingUrl}

Orders close the night before delivery. Questions? Reply to this email.

— ${restaurant.name}`}</pre>
                  </div>
                </details>

                <details className="rounded-lg border border-editorial-line bg-white">
                  <summary className="px-4 py-2.5 text-[12px] font-semibold text-editorial-ink cursor-pointer">💬 SMS template</summary>
                  <div className="px-4 pb-3 border-t border-editorial-line pt-2">
                    <pre className="text-[11px] text-editorial-ink-soft whitespace-pre-wrap font-mono leading-relaxed">{`Order lunch from ${restaurant.name}: ${orderingUrl}`}</pre>
                  </div>
                </details>

                <details className="rounded-lg border border-editorial-line bg-white">
                  <summary className="px-4 py-2.5 text-[12px] font-semibold text-editorial-ink cursor-pointer">📷 QR code (print on flyers, counter cards, etc.)</summary>
                  <div className="px-4 pb-3 border-t border-editorial-line pt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(orderingUrl)}`}
                      alt="QR code for ordering page"
                      width={240}
                      height={240}
                      className="rounded-lg border border-editorial-line"
                    />
                    <p className="text-[10px] text-editorial-ink-faint mt-2">Right-click → Save image.</p>
                  </div>
                </details>
              </div>

              {/* Step recap */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                {steps.slice(0, 9).map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      s.status === "done" ? "bg-editorial-green text-editorial-paper" : "bg-editorial-line text-editorial-ink-faint"
                    }`}>
                      {s.status === "done" ? "✓" : s.id}
                    </span>
                    <span className={`text-[11px] ${s.status === "done" ? "text-editorial-ink" : "text-editorial-ink-faint"}`}>{s.title}</span>
                  </div>
                ))}
              </div>

              <form action={launchAndComplete} className="flex flex-wrap items-center justify-between gap-2 pt-3">
                <Link href="/admin/onboarding?step=9" className="text-[12px] text-editorial-ink-soft no-underline hover:text-editorial-ink">← Back</Link>
                <div className="flex flex-wrap gap-2">
                  <a href={orderingUrl} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-full border border-editorial-line bg-white text-[13px] font-semibold text-editorial-ink no-underline hover:border-editorial-green hover:text-editorial-green transition">
                    Preview ordering page ↗
                  </a>
                  <button type="submit" className="px-5 py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                    Launch — go to dashboard →
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
