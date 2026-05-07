"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { id: "general", label: "General" },
  { id: "branding", label: "Branding" },
  { id: "domain", label: "Domain" },
  { id: "payments", label: "Payments" },
  { id: "notifications", label: "Notifications" },
  { id: "plan", label: "Plan" },
  { id: "danger", label: "Danger" },
] as const;

export type SettingsTabId = (typeof TABS)[number]["id"];

export function SettingsTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = (params.get("tab") as SettingsTabId | null) ?? "general";

  return (
    <div className="border-b border-slate-200 -mx-1">
      <div className="flex gap-1 px-1 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          const href = `${pathname}?tab=${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              className={`px-3 py-2.5 text-[12px] font-semibold whitespace-nowrap border-b-2 transition no-underline ${
                isActive
                  ? "border-brand-700 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
