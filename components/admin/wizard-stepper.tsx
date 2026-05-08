"use client";

import Link from "next/link";

export type WizardStepStatus = "done" | "current" | "todo" | "skipped";

export type WizardStep = {
  id: number;
  title: string;
  blurb: string;
  status: WizardStepStatus;
  optional?: boolean;
};

export function WizardStepper({
  steps,
  activeStepId,
  pathname = "/admin/onboarding",
}: {
  steps: WizardStep[];
  activeStepId: number;
  pathname?: string;
}) {
  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length;
  const pct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="rounded-[14px] border border-slate-100 bg-white p-3">
      <div className="mb-3 px-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          Setup
        </p>
        <p className="text-[16px] font-bold text-ink mt-0.5">
          {completedCount} of {totalCount}
        </p>
        <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 mt-2">
          <div
            className="h-full rounded-full bg-brand-700 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ol className="space-y-0.5">
        {steps.map((step) => {
          const isActive = step.id === activeStepId;
          const href = `${pathname}?step=${step.id}`;

          const dotBg =
            step.status === "done" ? "#16a34a" :
            step.status === "skipped" ? "#94a3b8" :
            isActive ? "#c41230" :
            "#e2e8f0";
          const dotFg =
            step.status === "done" || step.status === "skipped" || isActive
              ? "#ffffff"
              : "#94a3b8";

          return (
            <li key={step.id}>
              <Link
                href={href}
                className={`flex items-start gap-3 px-2 py-2.5 rounded-lg no-underline transition ${
                  isActive ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                  style={{ background: dotBg, color: dotFg }}
                >
                  {step.status === "done" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : step.status === "skipped" ? (
                    "—"
                  ) : (
                    step.id
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[12px] font-semibold leading-tight ${
                      isActive ? "text-brand-700" : "text-ink"
                    }`}
                  >
                    {step.title}
                    {step.optional && (
                      <span className="ml-1.5 text-[10px] font-normal text-slate-400">(optional)</span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{step.blurb}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
