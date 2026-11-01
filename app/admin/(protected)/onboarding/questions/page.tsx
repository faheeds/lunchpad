import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { isQuestionnaireEnabled } from "@/lib/onboarding-flag";
import { buildProfile, questionnaireSchema, settingsFor } from "@/lib/business-profile";
import { OnboardingQuestionnaire } from "@/components/admin/onboarding-questionnaire";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tell us about your kitchen" };

async function saveQuestionnaire(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  let raw: unknown = null;
  try {
    raw = JSON.parse(String(formData.get("answers") ?? ""));
  } catch {
    raw = null;
  }
  const parsed = questionnaireSchema.safeParse(raw);
  if (!parsed.success) redirect("/admin/onboarding/questions?error=invalid");

  const profile = buildProfile(parsed.data);
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      businessProfile: profile as unknown as Prisma.InputJsonValue,
      questionnaireCompletedAt: new Date(),
      ...settingsFor(profile),
    },
  });
  redirect("/admin/onboarding/plan");
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isQuestionnaireEnabled()) redirect("/admin/onboarding");
  const [params, restaurant] = await Promise.all([searchParams, requireRestaurant()]);
  await requireAdminRole("OWNER");

  return (
    <OnboardingQuestionnaire
      action={saveQuestionnaire}
      greetingName={restaurant.name}
      error={params.error ?? null}
    />
  );
}
