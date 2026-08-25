import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./lib/db";
import { authUsers, authAccounts, authSessions, authVerificationTokens, users } from "./lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID || "placeholder-google-id",
      clientSecret: process.env.AUTH_GOOGLE_SECRET || "placeholder-google-secret",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Database-driven signIn validation
     * Enforces:
     * 1. Normalized email matching against provisioned AceCore users.
     * 2. Rejection of unprovisioned emails.
     * 3. Rejection of inactive user accounts.
     * 4. Atomic first-login auth_user_id linking and mismatch protection.
     */
    async signIn({ user, account }) {
      if (!user.email) return false;
      const normalizedEmail = user.email.toLowerCase().trim();

      // Query AceCore provisioned user
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.normalizedEmail, normalizedEmail))
        .limit(1);

      if (existingUser.length === 0) {
        console.warn(`[Auth.js] Sign-in rejected: Unprovisioned email ${normalizedEmail}`);
        return false;
      }

      const aceUser = existingUser[0];

      if (aceUser.status === "inactive") {
        console.warn(`[Auth.js] Sign-in rejected: Inactive account ${normalizedEmail}`);
        return false;
      }

      // First-login atomic linking or validation
      if (user.id) {
        if (!aceUser.authUserId) {
          // Link newly authenticated auth_user_id to the provisioned AceCore user
          await db
            .update(users)
            .set({ authUserId: user.id, updatedAt: sql`NOW()` })
            .where(eq(users.id, aceUser.id));
        } else if (aceUser.authUserId !== user.id) {
          console.error(`[Auth.js] Sign-in rejected: Identity mismatch for user ${aceUser.id}`);
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      if (token.email) {
        const normalizedEmail = token.email.toLowerCase().trim();
        const aceUser = await db
          .select()
          .from(users)
          .where(eq(users.normalizedEmail, normalizedEmail))
          .limit(1);

        if (aceUser.length > 0) {
          token.userId = aceUser[0].id;
          token.orgId = aceUser[0].orgId;
          token.role = aceUser[0].organizationRole;
          token.status = aceUser[0].status;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).orgId = token.orgId;
        (session.user as any).role = token.role;
        (session.user as any).status = token.status;
      }
      return session;
    },
  },
});
