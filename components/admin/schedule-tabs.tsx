import Link from "next/link";

/**
 * Schedule sub-tab bar — shown at the top of /admin/delivery-dates
 * (Dates view) and /admin/locations (Locations view).
 *
 * Background: Locations used to be its own top-level admin tab, but
 * the operator's mental model is "Schedule" = where + when you serve.
 * Top-level nav now has a single Schedule entry (pointing at the Dates
 * view); this strip lets the operator flip between the two views
 * without leaving the Schedule mental model.
 *
 * Kept as a server component (just renders Link tags + a styling)
 * so neither page needs to dynamically import a client bundle just
 * for a tab bar.
 */
export function ScheduleTabs({ active }: { active: "dates" | "locations" }) {
  return (
    <div className="border-b border-slate-200 -mx-1">
      <div className="flex gap-1 px-1 overflow-x-auto no-scrollbar">
        <Tab href="/admin/delivery-dates" label="Dates" isActive={active === "dates"} />
        <Tab href="/admin/locations"      label="Locations" isActive={active === "locations"} />
      </div>
    </div>
  );
}

function Tab({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  const base = "px-3 py-2.5 text-[12px] font-semibold whitespace-nowrap border-b-2 transition no-underline";
  const activeCls = "border-brand-700 text-brand-700";
  const idleCls   = "border-transparent text-slate-500 hover:text-ink";
  return (
    <Link href={href} className={`${base} ${isActive ? activeCls : idleCls}`}>
      {label}
    </Link>
  );
}
