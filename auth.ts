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
     * 2. Rejection of unprovisioned emails with explicit classification.
     * 3. Rejection of inactive/deleted user accounts.
     */
    async signIn({ user, account, profile }) {
      try {
        const rawEmail = user?.email || (profile as any)?.email;
        if (!rawEmail) {
          console.warn("[Auth.js] Sign-in rejected [NO_EMAIL]: No email provided in OAuth profile");
          return false;
        }
        const normalizedEmail = rawEmail.toLowerCase().trim();

        // Query AceCore provisioned user from PostgreSQL
        const [aceUser] = await db
          .select()
          .from(users)
          .where(eq(users.normalizedEmail, normalizedEmail))
          .limit(1);

        if (!aceUser) {
          console.warn(`[Auth.js] Sign-in rejected [USER_NOT_FOUND]: Unprovisioned email ${normalizedEmail}`);
          return false;
        }

        if (aceUser.status === "inactive") {
          console.warn(`[Auth.js] Sign-in rejected [USER_INACTIVE]: Inactive account ${normalizedEmail}`);
          return false;
        }

        if (aceUser.status === "deleted") {
          console.warn(`[Auth.js] Sign-in rejected [USER_DELETED]: Permanently deleted account ${normalizedEmail}`);
          return false;
        }

        console.log(`[Auth.js] Sign-in approved [AUTHORIZED]: ${normalizedEmail} (role: ${aceUser.organizationRole})`);
        return true;
      } catch (err) {
        console.error("[Auth.js] Unexpected error in signIn callback:", err);
        return false;
      }
    },

    async jwt({ token, user, account, profile }) {
      try {
        const rawEmail = token.email || user?.email || (profile as any)?.email;
        if (rawEmail) {
          const normalizedEmail = rawEmail.toLowerCase().trim();
          const [aceUser] = await db
            .select()
            .from(users)
            .where(eq(users.normalizedEmail, normalizedEmail))
            .limit(1);

          if (aceUser && aceUser.status === "active") {
            token.userId = aceUser.id;
            token.orgId = aceUser.orgId;
            token.role = aceUser.organizationRole;
            token.status = aceUser.status;
            token.name = aceUser.fullName;

            // Atomically link Auth.js identity and sync avatar/name if newly provisioned
            const updates: Record<string, any> = { updatedAt: sql`NOW()` };
            if (user?.id && aceUser.authUserId !== user.id) {
              updates.authUserId = user.id;
            }
            if (user?.image && aceUser.avatarUrl !== user.image) {
              updates.avatarUrl = user.image;
            }
            if (user?.name && aceUser.fullName === "Client Contact" && user.name.trim()) {
              updates.fullName = user.name.trim();
            }

            if (Object.keys(updates).length > 1) {
              await db
                .update(users)
                .set(updates)
                .where(eq(users.id, aceUser.id));
            }
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
