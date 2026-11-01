"use client";

import { useState } from "react";
import type {
  Audience,
  Fulfillment,
  PaymentMethodChoice,
  QuestionnaireAnswers,
} from "@/lib/business-profile";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  greetingName?: string | null;
  error?: string | null;
};

const glass =
  "border border-white/20 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl shadow-[0_28px_60px_-28px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.35)]";
const glassOn =
  "border-[1.5px] border-white/80 bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-2xl shadow-[0_0_0_4px_rgba(233,180,76,0.22),inset_0_1px_0_rgba(255,255,255,0.5)]";

const AUDIENCE_OPTIONS: { value: Audience; title: string; blurb: string }[] = [
  { value: "schools", title: "Schools", blurb: "Hot lunch for students, with parent accounts." },
  { value: "offices", title: "Offices", blurb: "Team lunches and corporate catering." },
  { value: "groups", title: "Events & groups", blurb: "Community groups, clubs and party platters." },
  { value: "individuals", title: "Individual customers", blurb: "People ordering from you directly, for pickup or delivery." },
];

const FULFILLMENT_OPTIONS: { value: Fulfillment; title: string; blurb: string }[] = [
  { value: "pickup", title: "Pickup", blurb: "From a set spot" },
  { value: "delivery", title: "Delivery", blurb: "To an address" },
  { value: "dropoff", title: "Drop-off sites", blurb: "Schools, offices, groups" },
];

const PAYMENT_OPTIONS: { value: PaymentMethodChoice; title: string; blurb: string; note?: string }[] = [
  { value: "card", title: "Cards online", blurb: "Stripe, paid out to your bank", note: "Adds a step" },
  { value: "zelle", title: "Zelle", blurb: "Customers pay you directly and you confirm" },
  { value: "cash", title: "Cash", blurb: "Collect on the day, mark paid later" },
];

const VOLUME_OPTIONS = [
  { value: "under25", label: "Under 25" },
  { value: "25to100", label: "25 to 100" },
  { value: "100to300", label: "100 to 300" },
  { value: "300plus", label: "300+" },
] as const;
const CADENCE_OPTIONS = [
  { value: "everyDay", label: "Every day" },
  { value: "setDays", label: "Set days each week" },
  { value: "perEvent", label: "Event by event" },
] as const;
const MENU_OPTIONS = [
  { value: "few", label: "A few items" },
  { value: "10to25", label: "10 to 25" },
  { value: "import", label: "I'll import a list" },
] as const;
const TEAM_OPTIONS = [
  { value: "solo", label: "Just me" },
  { value: "team", label: "A small team" },
  { value: "multi", label: "Several locations" },
] as const;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full ${
        on ? "bg-[#E9B44C]" : "border-[1.5px] border-white/55"
      }`}
    >
      {on && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#14231A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  );
}

function Pills<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 font-editorial text-2xl tracking-tight">{legend}</legend>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-5 py-3 text-[14.5px] font-medium text-[#F6F1E6] ${value === o.value ? glassOn : glass}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function OnboardingQuestionnaire({ action, greetingName, error }: Props) {
  const [step, setStep] = useState(0);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment[]>([]);
  const [payments, setPayments] = useState<PaymentMethodChoice[]>([]);
  const [volume, setVolume] = useState<QuestionnaireAnswers["volume"]>();
  const [cadence, setCadence] = useState<QuestionnaireAnswers["cadence"]>();
  const [menuSize, setMenuSize] = useState<QuestionnaireAnswers["menuSize"]>();
  const [teamSize, setTeamSize] = useState<QuestionnaireAnswers["teamSize"]>();

  const canContinue =
    step === 0
      ? audiences.length > 0
      : step === 1
        ? fulfillment.length > 0 && payments.length > 0
        : Boolean(volume && cadence && menuSize && teamSize);

  const payload = JSON.stringify({ audiences, fulfillment, payments, volume, cadence, menuSize, teamSize });

  const copy = [
    {
      eyebrow: greetingName ? `Welcome, ${greetingName}` : "Welcome",
      title: "Let's tailor LunchPad to your kitchen.",
      body: "A few short questions. Your answers build a setup checklist that skips what you don't need.",
    },
    {
      eyebrow: "Orders & payment",
      title: "How do orders reach your customers?",
      body: "We only ask for what you need: no Stripe detour if you collect cash, no address fields if everyone picks up.",
    },
    {
      eyebrow: "Volume & menu",
      title: "Last few, then we'll build your plan.",
      body: "Rough numbers are fine. They set your menu depth and whether you need team logins.",
    },
  ][step];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0E1A13] text-[#F6F1E6]">
      <div aria-hidden="true" className="pointer-events-none fixed -right-32 -top-40 h-[560px] w-[560px] rounded-full bg-[#C0673E] opacity-50 blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none fixed left-64 top-[420px] h-[520px] w-[520px] rounded-full bg-[#5E8C61] opacity-50 blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none fixed -left-24 -top-32 h-[420px] w-[420px] rounded-full bg-[#D9A441] opacity-30 blur-[110px]" />

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <span className="text-lg font-semibold">LunchPad</span>
          <span className="text-[13px] text-[#F6F1E6]/75">Step {step + 1} of 3 · about 2 minutes</span>
        </header>

        <div className="flex gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded ${i <= step ? "bg-[#F6F1E6]" : "bg-white/20"}`} />
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm">
            We couldn't save your answers. Please check each question and try again.
          </p>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-col gap-5 pt-2 lg:pt-6">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E9B44C]">{copy.eyebrow}</span>
            <h1 className="font-editorial text-4xl leading-[1.06] tracking-tight sm:text-5xl">{copy.title}</h1>
            <p className="text-[17px] leading-relaxed text-[#F6F1E6]/80">{copy.body}</p>
          </div>

          <form action={action} className={`flex flex-col gap-7 rounded-[28px] p-6 sm:p-9 ${glass}`}>
            <input type="hidden" name="answers" value={payload} />

            {step === 0 && (
              <fieldset className="flex flex-col gap-4">
                <legend className="font-editorial text-3xl tracking-tight">Who do you feed?</legend>
                <p className="text-[14.5px] text-[#F6F1E6]/75">Select all that apply. This decides which fields and steps you'll see.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {AUDIENCE_OPTIONS.map((o) => {
                    const on = audiences.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setAudiences(toggle(audiences, o.value))}
                        className={`flex items-start justify-between gap-3 rounded-[20px] p-5 text-left text-[#F6F1E6] ${on ? glassOn : glass}`}
                      >
                        <span className="flex flex-col gap-2">
                          <span className="text-[17px] font-semibold">{o.title}</span>
                          <span className="text-[13px] leading-snug text-[#F6F1E6]/75">{o.blurb}</span>
                        </span>
                        <Check on={on} />
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {step === 1 && (
              <>
                <fieldset className="flex flex-col gap-3">
                  <legend className="font-editorial text-2xl tracking-tight">How do customers get their food?</legend>
                  <p className="text-[13.5px] text-[#F6F1E6]/75">Select all that apply. Many caterers offer more than one.</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {FULFILLMENT_OPTIONS.map((o) => {
                      const on = fulfillment.includes(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setFulfillment(toggle(fulfillment, o.value))}
                          className={`flex items-start justify-between gap-2 rounded-2xl p-4 text-left text-[#F6F1E6] ${on ? glassOn : glass}`}
                        >
                          <span className="flex flex-col gap-1.5">
                            <span className="text-[15px] font-semibold">{o.title}</span>
                            <span className="text-[12.5px] text-[#F6F1E6]/75">{o.blurb}</span>
                          </span>
                          <Check on={on} />
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 font-editorial text-2xl tracking-tight">How do you get paid?</legend>
                  {PAYMENT_OPTIONS.map((o) => {
                    const on = payments.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPayments(toggle(payments, o.value))}
                        className={`flex w-full items-center gap-4 rounded-[18px] px-5 py-4 text-left text-[#F6F1E6] ${on ? glassOn : glass}`}
                      >
                        <Check on={on} />
                        <span className="flex-1">
                          <span className="block text-base font-semibold">{o.title}</span>
                          <span className="mt-0.5 block text-[13px] text-[#F6F1E6]/75">{o.blurb}</span>
                        </span>
                        {o.note && <span className="text-xs font-semibold uppercase tracking-wider text-[#E9B44C]">{o.note}</span>}
                      </button>
                    );
                  })}
                </fieldset>
              </>
            )}

            {step === 2 && (
              <>
                <Pills legend="How many meals on a typical day?" options={VOLUME_OPTIONS} value={volume} onChange={setVolume} />
                <Pills legend="How often do you serve?" options={CADENCE_OPTIONS} value={cadence} onChange={setCadence} />
                <Pills legend="How big is the menu?" options={MENU_OPTIONS} value={menuSize} onChange={setMenuSize} />
                <Pills legend="Who helps in the kitchen?" options={TEAM_OPTIONS} value={teamSize} onChange={setTeamSize} />
              </>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-[15px] font-medium text-[#F6F1E6] disabled:opacity-40"
              >
                Back
              </button>
              {step < 2 ? (
                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => setStep(step + 1)}
                  className="rounded-full bg-[#F6F1E6] px-7 py-3.5 text-[15px] font-semibold text-[#14231A] disabled:opacity-40"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canContinue}
                  className="rounded-full bg-[#F6F1E6] px-7 py-3.5 text-[15px] font-semibold text-[#14231A] disabled:opacity-40"
                >
                  Build my plan
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
