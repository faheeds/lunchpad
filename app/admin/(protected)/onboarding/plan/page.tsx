import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { isQuestionnaireEnabled } from "@/lib/onboarding-flag";
import { buildPlan, parseStoredProfile } from "@/lib/business-profile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your setup plan" };

const glass =
  "border border-white/20 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl shadow-[0_28px_60px_-28px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.35)]";

const TAG_LABEL = { core: null, added: "New for you", optional: "Optional" } as const;

export default async function PlanPage() {
  if (!isQuestionnaireEnabled()) redirect("/admin/onboarding");
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const profile = parseStoredProfile(restaurant.businessProfile);
  if (!profile) redirect("/admin/onboarding/questions");
  const plan = buildPlan(profile);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0E1A13] text-[#F6F1E6]">
      <div aria-hidden="true" className="pointer-events-none fixed -right-32 -top-40 h-[560px] w-[560px] rounded-full bg-[#C0673E] opacity-50 blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none fixed -left-24 top-[420px] h-[520px] w-[520px] rounded-full bg-[#5E8C61] opacity-50 blur-[110px]" />

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <span className="text-lg font-semibold">LunchPad</span>
          <Link href="/admin/onboarding/questions" className="rounded-full border border-white/30 bg-white/10 px-5 py-2 text-[13px] font-medium">
            Edit my answers
          </Link>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-col gap-5 pt-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E9B44C]">Your plan is ready</span>
            <h1 className="font-editorial text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              Your setup, in {plan.steps.length} steps.
            </h1>
            <p className="text-[17px] leading-relaxed text-[#F6F1E6]/80">
              About {plan.totalMinutes} minutes in total. You can stop and pick up where you left off.
            </p>
            {plan.skipped.length > 0 && (
              <div className={`flex flex-col gap-2 rounded-2xl p-4 ${glass}`}>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#F6F1E6]/70">Skipped for you</span>
                <div className="flex flex-wrap gap-2">
                  {plan.skipped.map((s) => (
                    <span key={s} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[13px]">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={`flex flex-col gap-3 rounded-[28px] p-6 sm:p-8 ${glass}`}>
            <ol className="flex flex-col gap-3">
              {plan.steps.map((s, i) => (
                <li key={s.key} className={`flex items-center gap-4 rounded-[18px] px-5 py-4 ${glass}`}>
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-white/30 bg-white/15 text-sm font-semibold">{i + 1}</span>
                  <span className="flex-1">
                    <span className="block text-base font-semibold">{s.title}</span>
                    <span className="mt-0.5 block text-[13px] text-[#F6F1E6]/75">{s.blurb}</span>
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#F7DC9C]">
                    {TAG_LABEL[s.tag] ?? `${s.minutes} min`}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex justify-end pt-3">
              <Link href="/admin/onboarding" className="rounded-full bg-[#F6F1E6] px-7 py-3.5 text-[15px] font-semibold text-[#14231A]">
                Start setup
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
