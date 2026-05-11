import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { adminLoginSchema } from "@/lib/validation/order";
import { verifyMobileToken } from "@/lib/mobile-jwt";

// Production runs on multiple subdomains of the platform root domain
// (e.g. faheeds.lunchpad.us, hk.lunchpad.us). Auth callbacks happen on
// the apex (NEXTAUTH_URL), so we scope the session cookie to the platform
// root so it's visible on every subdomain. In dev / preview deployments
// (vercel.app, localhost) we fall back to host-only.
//
// Operators on custom domains (e.g. lunch.example.com) used to break here
// because the cookie was hardcoded to ".lunchpad.us" and wouldn't be sent
// on their custom host. Now we derive the root from `ROOT_DOMAIN` so the
// scoping matches whichever platform domain is configured. Custom-domain
// tenants still work because their entire OAuth round-trip happens on
// their own host — no cross-domain cookie needed.
const COOKIE_DOMAIN = (() => {
  try {
    const url = new URL(env.NEXTAUTH_URL);
    const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";

    // Platform root: scope cookies to `.<rootDomain>` so they travel
    // across all tenant subdomains.
    if (url.hostname.endsWith(`.${rootDomain}`) || url.hostname === rootDomain) {
      return `.${rootDomain}`;
    }
  } catch {}
  return undefined;
})();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/account/sign-in"
  },
  cookies: COOKIE_DOMAIN
    ? {
        // All cookies need domain=.lunchpad.us so the sign-in flow that starts on
        // a restaurant subdomain (faheeds.lunchpad.us) survives the OAuth bounce
        // through Google/Apple back to the apex (lunchpad.us). Without a shared
        // domain, NextAuth's state/nonce/PKCE cookies are invisible on the
        // callback host and the OAuth handshake fails with `Configuration`.
        sessionToken: {
          name: "__Secure-next-auth.session-token",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: COOKIE_DOMAIN },
        },
        callbackUrl: {
          name: "__Secure-next-auth.callback-url",
          options: { sameSite: "lax", path: "/", secure: true, domain: COOKIE_DOMAIN },
        },
        csrfToken: {
          name: "__Secure-next-auth.csrf-token",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: COOKIE_DOMAIN },
        },
        pkceCodeVerifier: {
          name: "__Secure-next-auth.pkce.code_verifier",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: COOKIE_DOMAIN, maxAge: 900 },
        },
        state: {
          name: "__Secure-next-auth.state",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: COOKIE_DOMAIN, maxAge: 900 },
        },
        nonce: {
          name: "__Secure-next-auth.nonce",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: COOKIE_DOMAIN },
        },
      }
    : undefined,
  callbacks: {
    async jwt({ token, user, account }) {
      const isAdminCredentialsLogin =
        user &&
        (account?.provider === "credentials" ||
          account?.provider === "admin-credentials" ||
          (typeof (user as { role?: string }).role === "string" && (user as { role?: string }).role === "ADMIN"));

      if (isAdminCredentialsLogin) {
        token.role = "ADMIN";
        token.adminUserId = user.id;
        token.restaurantId = (user as { restaurantId?: string }).restaurantId;
        token.adminRole = (user as { adminRole?: string }).adminRole;
        token.parentUserId = undefined;
      }

      if (account?.provider === "mobile-token") {
        token.role = "PARENT";
        token.parentUserId = (user as { parentUserId?: string }).parentUserId;
        token.adminUserId = undefined;
      }

      // Backfill `parentRestaurantId` for sessions that pre-date the
      // per-tenant ParentUser change. Without this, an old session keeps
      // working but `requireParent`'s tenant check has nothing to compare
      // against, so a parent signed in at Restaurant A would see Restaurant
      // A's data when visiting Restaurant B. Hydrate once from the DB
      // and the field rides on the JWT for the rest of the session.
      if (token.parentUserId && !token.parentRestaurantId) {
        try {
          const parent = await prisma.parentUser.findUnique({
            where: { id: token.parentUserId as string },
            select: { restaurantId: true },
          });
          if (parent?.restaurantId) {
            token.parentRestaurantId = parent.restaurantId;
          }
        } catch {
          // Best-effort. If the lookup fails we leave the token as-is and
          // requireParent's stricter check below will force a re-auth.
        }
      }

      if (account?.provider === "google" || account?.provider === "apple") {
        const email = user?.email?.toLowerCase();
        // The tenant cookie was dropped by startParentOAuth() in the
        // sign-in flow before the OAuth redirect. It tells us which
        // restaurant the parent is signing into so we can scope the
        // ParentUser upsert to (restaurantId, email) and avoid
        // cross-tenant data leaks.
        const cookieStore = await cookies();
        const tenantId = cookieStore.get("lp-tenant-id")?.value;

        if (email && tenantId) {
          // Verify the tenant exists and is active before upserting.
          const tenant = await prisma.restaurant.findUnique({
            where: { id: tenantId, isActive: true },
            select: { id: true },
          });
          if (tenant) {
            const parent = await prisma.parentUser.upsert({
              where: { restaurantId_email: { restaurantId: tenant.id, email } },
              update: {
                name: user.name ?? undefined,
                image: user.image ?? undefined,
                provider: account.provider,
                providerId: account.providerAccountId,
              },
              create: {
                restaurantId: tenant.id,
                email,
                name: user.name ?? undefined,
                image: user.image ?? undefined,
                provider: account.provider,
                providerId: account.providerAccountId,
              },
            });

            token.role = "PARENT";
            token.parentUserId = parent.id;
            token.parentRestaurantId = parent.restaurantId;
            token.adminUserId = undefined;

            // Burn the cookie now that we've used it. Prevents a stale
            // value from a prior sign-in attempt from leaking into a
            // future tenant context.
            cookieStore.delete("lp-tenant-id");
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as string | undefined) ?? "PARENT";
        session.user.parentUserId = token.parentUserId as string | undefined;
        session.user.adminUserId = token.adminUserId as string | undefined;
        session.user.restaurantId = token.restaurantId as string | undefined;
        session.user.adminRole = token.adminRole as string | undefined;
        // Tenant the parent record belongs to. Different from
        // `restaurantId` (admin tenant) because parents are scoped per
        // restaurant. requireParent() checks this matches the current
        // tenant on every page load.
        session.user.parentRestaurantId = token.parentRestaurantId as string | undefined;
      }
      return session;
    }
  },
  providers: [
    Credentials({
      id: "admin-credentials",
      name: "Admin Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        restaurantId: { label: "Restaurant ID", type: "text" }
      },
      async authorize(credentials) {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        // restaurantId comes from the login form (resolved from the tenant
        // subdomain). It MUST be present — without it, a query by email
        // alone would return whichever admin row Prisma returned first
        // across all tenants, which is both a multi-tenant data leak and
        // a confusing UX. Operators sign in only from their subdomain.
        const restaurantId = String((credentials as Record<string, unknown>).restaurantId ?? "");
        if (!restaurantId) {
          return null;
        }

        const admin = await prisma.adminUser.findFirst({
          where: {
            email: parsed.data.email.toLowerCase(),
            restaurantId,
          }
        });

        if (!admin) {
          return null;
        }

        const matches = await bcrypt.compare(parsed.data.password, admin.passwordHash);
        if (!matches) {
          return null;
        }

        // Stamp lastActiveAt on every successful login. Best-effort — a
        // failed update shouldn't block the user from signing in. Surfaced
        // on the team page so owners can see who's actively using the
        // dashboard. Update isn't awaited critically; we await it because
        // it's a single fast write and we want it visible on the very
        // next render.
        try {
          await prisma.adminUser.update({
            where: { id: admin.id },
            data: { lastActiveAt: new Date() },
          });
        } catch {
          // Swallow — login should still succeed if the column hasn't been
          // pushed to the DB yet (covers the brief window between code
          // deploy and `prisma db push` running).
        }

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: "ADMIN",
          adminRole: admin.role, // OWNER | MANAGER | STAFF
          restaurantId: admin.restaurantId,
        };
      }
    }),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET
          })
        ]
      : []),
    ...(env.AUTH_APPLE_ID && env.AUTH_APPLE_SECRET
      ? [
          Apple({
            clientId: env.AUTH_APPLE_ID,
            clientSecret: env.AUTH_APPLE_SECRET
          })
        ]
      : []),
    // Mobile app token exchange — accepts a short-lived JWT issued by
    // /api/mobile/auth/[provider] and converts it to a full NextAuth session.
    Credentials({
      id: "mobile-token",
      name: "Mobile Token",
      credentials: { token: { type: "text" } },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        try {
          const payload = await verifyMobileToken(String(credentials.token));
          return {
            id: payload.parentUserId,
            email: payload.email,
            name: payload.name ?? null,
            parentUserId: payload.parentUserId
          };
        } catch {
          return null;
        }
      }
    })
  ]
});
