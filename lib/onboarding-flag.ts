/**
 * Gate for the onboarding questionnaire. Off by default so production behaves
 * exactly as before until ONBOARDING_QUESTIONNAIRE=1 is set for an environment
 * (Preview first, Production when ready).
 */
export function isQuestionnaireEnabled(): boolean {
  return process.env.ONBOARDING_QUESTIONNAIRE === "1";
}
