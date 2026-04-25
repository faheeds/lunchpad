"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ label, pendingLabel, className }: { label: string; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`px-4 py-2.5 rounded-xl bg-brand-700 text-white text-[13px] font-semibold disabled:opacity-50 ${className ?? ""}`}
    >
      {pending ? (pendingLabel ?? "Working...") : label}
    </button>
  );
}
