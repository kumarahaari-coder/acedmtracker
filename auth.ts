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
     */
    async signIn({ user, account, profile }) {
      try {
        if (!user.email) {
          console.warn("[Auth.js] Sign-in rejected: No email provided");
          return false;
        }
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

        // Atomically link Auth.js identity and avatar on first or subsequent logins
        const updates: Record<string, any> = { updatedAt: sql`NOW()` };
        if (!aceUser.authUserId && (user as any).id) {
          updates.authUserId = (user as any).id;
        }
        if (user.image && aceUser.avatarUrl !== user.image) {
          updates.avatarUrl = user.image;
        }
        if (user.name && aceUser.fullName === "Client Contact" && user.name.trim()) {
          updates.fullName = user.name.trim();
        }

        if (Object.keys(updates).length > 1) {
          await db
            .update(users)
            .set(updates)
            .where(eq(users.id, aceUser.id));
        }

        return true;
      } catch (err) {
        console.error("[Auth.js] Unexpected error in signIn callback:", err);
        return false;
      }
    },

    async jwt({ token, user, account, profile }) {
      try {
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
            token.name = aceUser[0].fullName;
          }
        }
      } catch (err) {
        console.error("[Auth.js] Error in jwt callback:", err);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).orgId = token.orgId;
        (session.user as any).role = token.role;
        (session.user as any).status = token.status;
        if (token.name) {
          session.user.name = token.name as string;
        }
      }
      return session;
    },
  },
});
