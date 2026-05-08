import { redirect } from "next/navigation";

/**
 * Legacy /admin/setup is replaced by the /admin/onboarding wizard.
 * Anyone hitting an old bookmark or link is forwarded transparently.
 */
export default async function LegacySetupRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const suffix = qs.toString();
  redirect(`/admin/onboarding${suffix ? `?${suffix}` : ""}`);
}
