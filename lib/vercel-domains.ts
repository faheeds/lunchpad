/**
 * Programmatic Vercel domain registration. Used when a new restaurant is
 * created (to add `<slug>.lunchpad.us`) and when an operator brings their
 * own domain via Settings → Domain.
 *
 * Requires three env vars:
 *   VERCEL_API_TOKEN     — personal/team API token from vercel.com/account/tokens
 *   VERCEL_PROJECT_ID    — the lunchpad project's ID (vercel.com → project → settings)
 *   VERCEL_TEAM_ID       — your team ID (only required if the project is owned by a team)
 *
 * If you upgrade to Pro and add a `*.lunchpad.us` wildcard, this entire
 * module becomes unnecessary for subdomains — Vercel handles them
 * automatically. Keep it around for the custom-domain feature (operators
 * pointing their own domain at LunchPad).
 */

const VERCEL_API = "https://api.vercel.com";

function authHeaders() {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error("VERCEL_API_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function projectScopedPath(path: string) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!projectId) throw new Error("VERCEL_PROJECT_ID not configured");
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  return `${VERCEL_API}/v10/projects/${projectId}${path}${qs}`;
}

/**
 * Adds `<domain>` to the project. Idempotent — calling twice returns success
 * the second time (Vercel returns 409 with a known `domain_already_in_use`
 * code which we treat as success).
 */
export async function addDomainToProject(domain: string): Promise<{
  ok: boolean;
  alreadyExists: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(projectScopedPath("/domains"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: domain }),
    });
    if (res.ok) return { ok: true, alreadyExists: false };
    const data = await res.json().catch(() => ({}));
    const code = (data as { error?: { code?: string } }).error?.code;
    if (code === "domain_already_in_use" || code === "domain_already_exists") {
      return { ok: true, alreadyExists: true };
    }
    const message = (data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    return { ok: false, alreadyExists: false, error: message };
  } catch (e) {
    return { ok: false, alreadyExists: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Removes `<domain>` from the project. Useful when an operator un-sets their custom domain. */
export async function removeDomainFromProject(domain: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(projectScopedPath(`/domains/${encodeURIComponent(domain)}`), {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const message = (data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    return { ok: false, error: message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Verifies a domain (kicks off SSL cert issuance). Vercel auto-verifies
 * once DNS is correct, but calling this can speed it up.
 */
export async function verifyDomain(domain: string): Promise<{ ok: boolean; verified: boolean; error?: string }> {
  try {
    const res = await fetch(projectScopedPath(`/domains/${encodeURIComponent(domain)}/verify`), {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = (await res.json()) as { verified?: boolean };
      return { ok: true, verified: Boolean(data.verified) };
    }
    const data = await res.json().catch(() => ({}));
    const message = (data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    return { ok: false, verified: false, error: message };
  } catch (e) {
    return { ok: false, verified: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
