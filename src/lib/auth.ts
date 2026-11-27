import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // Two layers: per-IP (stops one attacker trying many accounts) and per-email
        // (stops a targeted brute force on one account from a rotating IP).
        const ip = getClientIp(request);
        const [ipOk, emailOk] = await Promise.all([
          checkRateLimit(`ratelimit:login:ip:${ip}`, 20, 15 * 60),
          checkRateLimit(`ratelimit:login:email:${email}`, 5, 15 * 60),
        ]);
        if (!ipOk || !emailOk) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    // Re-checks the role from the DB periodically (not on every request) so a promotion/demotion
    // by an admin takes effect quickly without a DB query on every single page load.
    jwt: async ({ token, user }) => {
      const t = token as { id?: string; role?: "CUSTOMER" | "STAFF" | "ADMIN"; roleCheckedAt?: number };

      if (user) {
        t.role = (user as { role: "CUSTOMER" | "STAFF" | "ADMIN" }).role;
        t.id = user.id as string;
        t.roleCheckedAt = Date.now();
        return token;
      }

      const ROLE_RECHECK_INTERVAL_MS = 30_000;
      if (t.id && Date.now() - (t.roleCheckedAt ?? 0) > ROLE_RECHECK_INTERVAL_MS) {
        const dbUser = await prisma.user.findUnique({ where: { id: t.id }, select: { role: true } });
        t.role = dbUser?.role ?? t.role;
        t.roleCheckedAt = Date.now();
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.role = token.role as "CUSTOMER" | "STAFF" | "ADMIN";
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
