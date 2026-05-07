import { redirect } from "next/navigation";

/**
 * Legacy URL — schools were renamed to locations to support both school
 * and office customers. Forward any old bookmarks to the new path,
 * preserving query string (e.g. ?edit=<id>).
 */
export default async function SchoolsRedirect({
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
  redirect(`/admin/locations${suffix ? `?${suffix}` : ""}`);
}
