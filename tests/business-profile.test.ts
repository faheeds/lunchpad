import { describe, expect, it } from "vitest";
import { getLabelsForOperator } from "@/lib/location-labels";
import {
  buildPlan,
  buildProfile,
  getVocabulary,
  operatorTypeFor,
  parseStoredProfile,
  questionnaireSchema,
  settingsFor,
  type QuestionnaireAnswers,
} from "@/lib/business-profile";

const base: QuestionnaireAnswers = {
  audiences: ["individuals"],
  fulfillment: ["pickup", "delivery"],
  payments: ["zelle", "cash"],
  volume: "25to100",
  cadence: "setDays",
  menuSize: "few",
  teamSize: "solo",
};

const SCHOOL_WORDS = /student|parent|classroom|grade|teacher|school|child|kid/i;

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

describe("business profile", () => {
  it("never uses school language for a caterer that did not pick schools", () => {
    const profile = buildProfile(base);
    const strings = [
      ...allStrings(getVocabulary(profile)),
      ...allStrings(buildPlan(profile)),
    ];
    for (const s of strings) expect(s).not.toMatch(SCHOOL_WORDS);
  });

  it("also stays school-free for office and group operators", () => {
    const profile = buildProfile({ ...base, audiences: ["offices", "groups"] });
    const strings = [...allStrings(getVocabulary(profile)), ...allStrings(buildPlan(profile))];
    for (const s of strings) expect(s).not.toMatch(SCHOOL_WORDS);
  });

  it("uses school language when schools are selected", () => {
    const profile = buildProfile({ ...base, audiences: ["schools"] });
    expect(getVocabulary(profile).customer).toBe("Student");
    expect(getVocabulary(profile).orderer).toBe("Parent");
    expect(operatorTypeFor(profile)).toBe("school");
  });

  it("maps mixed audiences to hybrid with neutral words, school words on request", () => {
    const profile = buildProfile({ ...base, audiences: ["schools", "individuals"] });
    expect(operatorTypeFor(profile)).toBe("hybrid");
    expect(getVocabulary(profile).customer).toBe("Customer");
    expect(getVocabulary(profile, "schools").customer).toBe("Student");
    expect(getVocabulary(profile, "individuals").customer).toBe("Customer");
  });

  it("maps individuals (and offices plus individuals) to caterer", () => {
    expect(operatorTypeFor(buildProfile(base))).toBe("caterer");
    expect(operatorTypeFor(buildProfile({ ...base, audiences: ["offices", "individuals"] }))).toBe("caterer");
    expect(operatorTypeFor(buildProfile({ ...base, audiences: ["offices"] }))).toBe("office");
  });

  it("falls back to legacy school vocabulary when there is no profile", () => {
    expect(getVocabulary(null).customer).toBe("Student");
  });

  it("derives restaurant settings from answers", () => {
    expect(settingsFor(buildProfile(base))).toEqual({
      operatorType: "caterer",
      acceptZelle: true,
      acceptCash: true,
      deliveryEnabled: true,
    });
    expect(settingsFor(buildProfile({ ...base, fulfillment: ["pickup"], payments: ["card"] }))).toEqual({
      operatorType: "caterer",
      acceptZelle: false,
      acceptCash: false,
      deliveryEnabled: false,
    });
  });

  it("makes Stripe optional when offline payments are also on, and skips it when cards are off", () => {
    const both = buildPlan(buildProfile({ ...base, payments: ["card", "zelle"] }));
    expect(both.steps.find((s) => s.key === "payments")?.tag).toBe("optional");
    const offlineOnly = buildPlan(buildProfile(base));
    expect(offlineOnly.skipped).toContain("Stripe Connect");
    const cardOnly = buildPlan(buildProfile({ ...base, payments: ["card"] }));
    expect(cardOnly.steps.find((s) => s.key === "payments")?.tag).toBe("core");
  });

  it("adds a team step only when the operator has help", () => {
    expect(buildPlan(buildProfile(base)).steps.some((s) => s.key === "team")).toBe(false);
    expect(buildPlan(buildProfile({ ...base, teamSize: "team" })).steps.some((s) => s.key === "team")).toBe(true);
  });

  it("totals minutes across steps", () => {
    const plan = buildPlan(buildProfile(base));
    expect(plan.totalMinutes).toBe(plan.steps.reduce((n, s) => n + s.minutes, 0));
  });

  it("validates answers and round-trips through stored JSON", () => {
    expect(questionnaireSchema.safeParse({ ...base, audiences: [] }).success).toBe(false);
    const profile = buildProfile(base);
    expect(parseStoredProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    expect(parseStoredProfile(null)).toBeNull();
    expect(parseStoredProfile({ answers: { audiences: ["nope"] } })).toBeNull();
  });
  it("gives caterers customer wording, not school or office wording", () => {
    const labels = getLabelsForOperator("caterer");
    for (const s of allStrings(labels)) {
      expect(s).not.toMatch(SCHOOL_WORDS);
      expect(s).not.toMatch(/employee/i);
    }
    expect(labels.unit).toBe("Customer");
    expect(getLabelsForOperator("school").unit).toBe("Student");
    expect(getLabelsForOperator("office").unit).toBe("Employee");
  });
});
