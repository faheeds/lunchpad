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
    <div className="rounded-[16px] border border-editorial-line bg-white p-3 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
      <div className="mb-3 px-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint">
          Setup
        </p>
        <p className="text-[16px] font-editorial font-[500] text-editorial-ink mt-0.5">
          {completedCount} of {totalCount}
        </p>
        <div className="h-1.5 rounded-full overflow-hidden bg-editorial-paper-2 mt-2">
          <div
            className="h-full rounded-full bg-editorial-green transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ol className="space-y-0.5">
        {steps.map((step, index) => {
          const isActive = step.id === activeStepId;
          const href = `${pathname}?step=${step.id}`;
          const stepNumber = index + 1;

          const dotBg =
            step.status === "done" ? "#2C4031" :
            step.status === "skipped" ? "#938B78" :
            isActive ? "#2C4031" :
            "#EFE8D7";
          const dotFg =
            step.status === "done" || step.status === "skipped" || isActive
              ? "#F6F1E6"
              : "#938B78";

          return (
            <li key={step.id}>
              <Link
                href={href}
                className={`flex items-start gap-3 px-2 py-2.5 rounded-lg no-underline transition ${
                  isActive ? "bg-editorial-paper-2" : "hover:bg-editorial-paper-2"
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
                    stepNumber
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[12px] font-editorial font-[500] leading-tight ${
                      isActive ? "text-editorial-green" : "text-editorial-ink"
                    }`}
                  >
                    {step.title}
                    {step.optional && (
                      <span className="ml-1.5 text-[10px] font-normal text-editorial-ink-faint">(optional)</span>
                    )}
                  </p>
                  <p className="text-[11px] text-editorial-ink-faint mt-0.5 leading-snug">{step.blurb}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
