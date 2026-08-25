import { pgTable, uuid, text, timestamp, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export const MembershipRoleEnum = ["consultant", "designer", "video_editor", "client", "collaborator"] as const;
export type MembershipRole = (typeof MembershipRoleEnum)[number];

export const MembershipStatusEnum = ["active", "revoked"] as const;
export type MembershipStatus = (typeof MembershipStatusEnum)[number];

export const projectMemberships = pgTable(
  "project_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id").notNull(),
    membershipRole: text("membership_role", { enum: MembershipRoleEnum }).notNull().default("designer"),
    status: text("status", { enum: MembershipStatusEnum }).notNull().default("active"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedByUserId: uuid("assigned_by_user_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_project_memberships_project_user").on(table.projectId, table.userId),
    uniqueIndex("idx_project_memberships_user_status").on(table.userId, table.status),
    uniqueIndex("idx_project_memberships_project_status").on(table.projectId, table.status),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_memberships_project_org",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId, table.orgId],
      foreignColumns: [users.id, users.orgId],
      name: "fk_memberships_user_org",
    }).onDelete("cascade"),
  ]
);

export type ProjectMembership = typeof projectMemberships.$inferSelect;
export type NewProjectMembership = typeof projectMemberships.$inferInsert;
