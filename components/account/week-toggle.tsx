import Link from "next/link";

/**
 * "This week / Next week" switch for the weekly plan. Server-rendered links
 * (?week=current|next) so the page, planner and checkout all agree on a
 * single week. Hidden unless both weeks have open delivery days.
 */
export function WeekToggle({
  basePath,
  scope,
  show,
}: {
  basePath: string;
  scope: "current" | "next";
  show: boolean;
}) {
  if (!show) return null;
  const options = [
    { key: "current", label: "This week" },
    { key: "next", label: "Next week" },
  ] as const;
  return (
    <div className="flex gap-2 mb-3" role="group" aria-label="Choose lunch week">
      {options.map(({ key, label }) => {
        const active = scope === key;
        return (
          <Link
            key={key}
            href={`${basePath}?week=${key}`}
            replace
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "px-3.5 py-1.5 rounded-full bg-[#1a0f0f] text-white text-[12px] font-semibold"
                : "px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[12px] font-medium"
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
