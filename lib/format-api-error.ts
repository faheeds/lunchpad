import { ZodError } from "zod";

export function formatApiError(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    if (firstIssue?.message) {
      const msg = firstIssue.message;
      if (msg && msg.trim() && msg.length < 100) {
        return msg;
      }
    }
    return fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
