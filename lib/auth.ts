import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { adminLoginSchema } from "@/lib/validation/order";
import { verifyMobileToken } from "@/lib/mobile-jwt";

// Production runs on multiple subdomains of lunchpad.us (faheeds.lunchpad.us,
// hk.lunchpad.us, etc.). Auth callbacks happen on the apex (NEXTAUTH_URL),
// so we explicitly scope the session cookie to `.lunchpad.us` so it's visible
// on every subdomain. In dev / preview deployments, fall back to host-only.
const COOKIE_DOMAIN = (() => {
  try {
    const url = new URL(env.NEXTAUTH_URL);
    // Only use the cookie domain when running on the production apex.
    // For *.vercel.app or localhost we want host-only cookies.
    if (url.hostname.endsWith(".lunchpad.us") || url.hostname === "lunchpad.us") {
      return ".lunchpad.us";
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
        sessionToken: {
          name: "__Secure-next-auth.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
            domain: COOKIE_DOMAIN,
          },
        },
        callbackUrl: {
          name: "__Secure-next-auth.callback-url",
          options: { sameSite: "lax", path: "/", secure: true, domain: COOKIE_DOMAIN },
        },
        // CSRF cookie must be readable across subdomains — sign-in flow starts on
        // a restaurant subdomain (e.g. faheeds.lunchpad.us) and OAuth callback
        // lands on the apex (lunchpad.us). __Host- prefix is host-only and would
        // break that cross-subdomain handoff, so we use __Secure- with domain.
        csrfToken: {
          name: "__Secure-next-auth.csrf-token",
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

      if (account?.provider === "google" || account?.provider === "apple") {
        const email = user?.email?.toLowerCase();
        if (email) {
          const parent = await prisma.parentUser.upsert({
            where: { email },
            update: {
              name: user.name ?? undefined,
              image: user.image ?? undefined,
              provider: account.provider,
              providerId: account.providerAccountId
            },
            create: {
              email,
              name: user.name ?? undefined,
              image: user.image ?? undefined,
              provider: account.provider,
              providerId: account.providerAccountId
            }
          });

          token.role = "PARENT";
          token.parentUserId = parent.id;
          token.adminUserId = undefined;
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

        // restaurantId is passed from the login form (resolved from subdomain)
        const restaurantId = String((credentials as Record<string, unknown>).restaurantId ?? "");

        const admin = await prisma.adminUser.findFirst({
          where: {
            email: parsed.data.email.toLowerCase(),
            ...(restaurantId ? { restaurantId } : {}),
          }
        });

        if (!admin) {
          return null;
        }

        const matches = await bcrypt.compare(parsed.data.password, admin.passwordHash);
        if (!matches) {
          return null;
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
