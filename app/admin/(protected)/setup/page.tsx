import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdmin } from "@/lib/admin-auth";
import { slugify } from "@/lib/utils";
import { BulkMenuUpload } from "@/components/admin/bulk-menu-upload";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)"  },
];

// ── Server actions ────────────────────────────────────────────────────────────

async function createSchool(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  const name = String(formData.get("name") || "").trim();
  const timezone = String(formData.get("timezone") || "America/Los_Angeles");
  const cutoffTime = String(formData.get("cutoffTime") || "21:00");
  const [hourStr, minStr] = cutoffTime.split(":");
  if (!name) return;
  await prisma.school.create({
    data: {
      restaurantId: restaurant.id,
      name,
      slug: slugify(name),
      timezone,
      defaultCutoffHour: parseInt(hourStr ?? "21", 10),
      defaultCutoffMinute: parseInt(minStr ?? "0", 10),
      collectTeacher: true,
      collectClassroom: true,
      isActive: true,
    },
  });
  revalidatePath("/admin/setup");
}

async function createMenuItem(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  const name = String(formData.get("name") || "").trim();
  const priceStr = String(formData.get("price") || "0");
  const description = String(formData.get("description") || "").trim();
  if (!name) return;
  const basePriceCents = Math.round(parseFloat(priceStr) * 100);
  await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      name,
      slug: slugify(name),
      description: description || null,
      basePriceCents,
      isActive: true,
    },
  });
  revalidatePath("/admin/setup");
}

async function createDeliveryDate(formData: FormData) {
  "use server";
  const schoolId = String(formData.get("schoolId") || "");
  const deliveryDateStr = String(formData.get("deliveryDate") || "");
  const cutoffAtStr = String(formData.get("cutoffAt") || "");
  if (!schoolId || !deliveryDateStr || !cutoffAtStr) return;

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return;

  await prisma.deliveryDate.create({
    data: {
      schoolId,
      deliveryDate: fromZonedTime(`${deliveryDateStr} 11:00:00`, school.timezone),
      cutoffAt: fromZonedTime(cutoffAtStr.replace("T", " ") + ":00", school.timezone),
      orderingOpen: true,
    },
  });
  revalidatePath("/admin/setup");
}

async function finishSetup() {
  "use server";
  redirect("/admin/dashboard");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminSetupPage() {
  const [session, restaurant] = await Promise.all([requireAdmin(), requireRestaurant()]);
  const adminRole = session.user?.adminRole ?? "STAFF";

  const [schools, menuItems, upcomingDates] = await Promise.all([
    prisma.school.findMany({ where: { restaurantId: restaurant.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.menuItem.findMany({ where: { restaurantId: restaurant.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.deliveryDate.findMany({
      where: { school: { restaurantId: restaurant.id }, deliveryDate: { gte: new Date() } },
      include: { school: true },
      orderBy: { deliveryDate: "asc" },
      take: 3,
    }),
  ]);

  const hasSchool = schools.length > 0;
  const hasMenu   = menuItems.length > 0;
  const hasDate   = upcomingDates.length > 0;
  const allDone   = hasSchool && hasMenu && hasDate;

  const completedCount = [hasSchool, hasMenu, hasDate].filter(Boolean).length;

  return (
    <div style={{ maxWidth: 580, margin: "0 auto", paddingBottom: 40 }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", padding: "32px 0 28px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 52, height: 52, borderRadius: 16,
          background: "linear-gradient(135deg, #c41230, #8b0d22)",
          marginBottom: 16, boxShadow: "0 4px 16px rgba(196,18,48,0.3)",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f1923", marginBottom: 6, letterSpacing: "-0.02em" }}>
          Welcome to LunchPad{restaurant.name ? `, ${restaurant.name}` : ""}!
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
          Let&apos;s get your lunch portal ready. Complete these 3 steps to start taking orders.
        </p>

        {/* Progress bar */}
        <div style={{ margin: "20px auto 0", maxWidth: 320 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>Setup progress</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: completedCount === 3 ? "#16a34a" : "#c41230" }}>
              {completedCount} / 3 complete
            </span>
          </div>
          <div style={{ height: 6, background: "#e5e7eb", borderRadius: 100, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 100,
              width: `${(completedCount / 3) * 100}%`,
              background: completedCount === 3
                ? "linear-gradient(90deg, #16a34a, #22c55e)"
                : "linear-gradient(90deg, #c41230, #ef4444)",
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Step 1: School ──────────────────────────────────────── */}
        <SetupCard
          step={1}
          title="Add your first school"
          description="Schools are the delivery locations where you serve lunch."
          done={hasSchool}
          doneContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {schools.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{s.timezone}</span>
                </div>
              ))}
              <Link href="/admin/schools" style={{ fontSize: 12, color: "#c41230", textDecoration: "none", marginTop: 4 }}>
                Manage schools →
              </Link>
            </div>
          }
          formContent={
            <form action={createSchool} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>School name</label>
                  <input name="name" required placeholder="e.g. Lincoln Elementary"
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Timezone</label>
                  <select name="timezone" defaultValue="America/Los_Angeles" style={inputStyle}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Default ordering cutoff time</label>
                <input name="cutoffTime" type="time" defaultValue="21:00" style={inputStyle} />
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  Parents can&apos;t order after this time the night before delivery.
                </p>
              </div>
              <button type="submit" style={primaryBtnStyle}>Add school</button>
            </form>
          }
        />

        {/* ── Step 2: Menu item ───────────────────────────────────── */}
        <SetupCard
          step={2}
          title="Add your first menu item"
          description="Add at least one item parents can order. You can build the full menu later."
          done={hasMenu}
          doneContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {menuItems.slice(0, 4).map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#c41230" }}>
                    ${(item.basePriceCents / 100).toFixed(2)}
                  </span>
                </div>
              ))}
              {menuItems.length > 4 && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>+{menuItems.length - 4} more items</span>
              )}
              <Link href="/admin/menu" style={{ fontSize: 12, color: "#c41230", textDecoration: "none", marginTop: 4 }}>
                Manage menu →
              </Link>
            </div>
          }
          formContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Quick single-item form */}
              <form action={createMenuItem} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Item name</label>
                    <input name="name" required placeholder="e.g. Smash Burger" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Price</label>
                    <div style={{ position: "relative" }}>
                      <span style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        fontSize: 13, color: "#6b7280", pointerEvents: "none",
                      }}>$</span>
                      <input name="price" required type="number" step="0.01" min="0"
                        placeholder="12.99"
                        style={{ ...inputStyle, paddingLeft: 24 }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>
                    Description <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input name="description" placeholder="e.g. Classic smash patty with American cheese"
                    style={inputStyle} />
                </div>
                <button type="submit" style={primaryBtnStyle}>Add menu item</button>
              </form>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px" }}>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>or bulk upload</span>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              </div>

              {/* Bulk upload */}
              <BulkMenuUpload />
            </div>
          }
        />

        {/* ── Step 3: Delivery date ───────────────────────────────── */}
        <SetupCard
          step={3}
          title="Schedule your first delivery"
          description="Create a delivery date so parents know when to order for."
          done={hasDate}
          doneContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {upcomingDates.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                    {d.deliveryDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{d.school.name}</span>
                </div>
              ))}
              <Link href="/admin/delivery-dates" style={{ fontSize: 12, color: "#c41230", textDecoration: "none", marginTop: 4 }}>
                Manage schedule →
              </Link>
            </div>
          }
          formContent={
            schools.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>
                Complete step 1 first — you need a school before scheduling a delivery.
              </p>
            ) : (
              <form action={createDeliveryDate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>School</label>
                  <select name="schoolId" style={inputStyle}>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Delivery date</label>
                    <input name="deliveryDate" type="date" required style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ordering closes at</label>
                    <input name="cutoffAt" type="datetime-local" required style={inputStyle} />
                  </div>
                </div>
                <button type="submit" style={primaryBtnStyle}>Schedule delivery</button>
              </form>
            )
          }
        />

      </div>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 28, textAlign: "center" }}>
        {allDone ? (
          <form action={finishSetup}>
            <button type="submit" style={{
              padding: "15px 40px", borderRadius: 12, fontSize: 15, fontWeight: 700,
              color: "white", border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #16a34a, #22c55e)",
              boxShadow: "0 4px 20px rgba(22,163,74,0.35)",
            }}>
              You&apos;re all set — Go to Dashboard →
            </button>
          </form>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>
              Complete the {3 - completedCount} remaining step{3 - completedCount !== 1 ? "s" : ""} above to unlock your dashboard.
            </p>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              color: "#9ca3af", background: "#f3f4f6", border: "1px solid #e5e7eb",
            }}>
              Go to Dashboard
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SetupCard({
  step,
  title,
  description,
  done,
  doneContent,
  formContent,
}: {
  step: number;
  title: string;
  description: string;
  done: boolean;
  doneContent: React.ReactNode;
  formContent: React.ReactNode;
}) {
  return (
    <div style={{
      background: "white", borderRadius: 16,
      border: done ? "1px solid #bbf7d0" : "1px solid #e5e7eb",
      overflow: "hidden",
      boxShadow: done ? "0 1px 3px rgba(0,0,0,0.04)" : "0 1px 8px rgba(0,0,0,0.06)",
      transition: "border-color 0.2s",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        padding: "18px 20px",
        borderBottom: "1px solid #f3f4f6",
        background: done ? "#f0fdf4" : "white",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: done ? "#16a34a" : "#0f1923",
          boxShadow: done ? "0 2px 8px rgba(22,163,74,0.3)" : "0 2px 8px rgba(15,25,35,0.2)",
        }}>
          {done ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{step}</span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: done ? "#15803d" : "#0f1923", marginBottom: 2 }}>
            {title}
            {done && <span style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", marginLeft: 8 }}>Complete</span>}
          </p>
          <p style={{ fontSize: 12, color: done ? "#4ade80" : "#6b7280", lineHeight: 1.5 }}>
            {description}
          </p>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "16px 20px" }}>
        {done ? doneContent : formContent}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 8, border: "1px solid #d1d5db",
  fontSize: 13, padding: "9px 12px", outline: "none",
  background: "white", color: "#0f1923", boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  width: "100%", padding: "11px", borderRadius: 10,
  background: "linear-gradient(135deg, #c41230, #8b0d22)",
  color: "white", fontSize: 13, fontWeight: 700,
  border: "none", cursor: "pointer",
  boxShadow: "0 2px 10px rgba(196,18,48,0.3)",
};
