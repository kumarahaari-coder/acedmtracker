import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { authUsers } from "./auth";

export const OrganizationRoleEnum = ["founder", "admin", "consultant", "designer", "client"] as const;
export type OrganizationRole = (typeof OrganizationRoleEnum)[number];

export const UserStatusEnum = ["active", "inactive", "deleted"] as const;
export type UserStatus = (typeof UserStatusEnum)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: text("legacy_id").unique(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    authUserId: uuid("auth_user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull().unique(),
    fullName: text("full_name").notNull(),
    avatarUrl: text("avatar_url"),
    organizationRole: text("organization_role", { enum: OrganizationRoleEnum }).notNull().default("designer"),
    status: text("status", { enum: UserStatusEnum }).notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
    deletionReason: text("deletion_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_users_id_org_id").on(table.id, table.orgId),
    uniqueIndex("idx_users_normalized_email").on(table.normalizedEmail),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
