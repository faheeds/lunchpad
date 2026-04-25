export function isDuplicateWebhookEvent(existingEventId: string | null | undefined, incomingEventId: string) {
  return existingEventId === incomingEventId;
}

export function shouldSendConfirmation(alreadyPaid: boolean, confirmationSentAt?: Date | null) {
  return !alreadyPaid || !confirmationSentAt;
}
