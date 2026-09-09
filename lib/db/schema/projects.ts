import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const ProjectTierEnum = ["tier_1", "tier_2", "tier_3"] as const;
export type ProjectTier = (typeof ProjectTierEnum)[number];

export const EngagementModelEnum = ["deliverable_based", "objective_based"] as const;
export type EngagementModel = (typeof EngagementModelEnum)[number];

export const ProjectStatusEnum = ["active", "paused", "archived", "trash", "retained_archive"] as const;
export type ProjectStatus = (typeof ProjectStatusEnum)[number];

export const RequiredApproversEnum = ["founder", "consultant", "both"] as const;
export type RequiredApprovers = (typeof RequiredApproversEnum)[number];

export const ApprovalModeEnum = ["parallel", "sequential"] as const;
export type ApprovalMode = (typeof ApprovalModeEnum)[number];

export const ProjectTypeEnum = ["digital_marketing", "ui_design"] as const;
export type ProjectType = (typeof ProjectTypeEnum)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: text("legacy_id").unique(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    clientName: text("client_name").notNull(),
    projectType: text("project_type", { enum: ProjectTypeEnum }).notNull().default("digital_marketing"),
    masterFigmaUrl: text("master_figma_url"),
    tier: text("tier", { enum: ProjectTierEnum }).notNull().default("tier_2"),
    engagementModel: text("engagement_model", { enum: EngagementModelEnum }).notNull().default("deliverable_based"),
    status: text("status", { enum: ProjectStatusEnum }).notNull().default("active"),
    brandPrimaryColor: text("brand_primary_color").default("#0071e3"),
    briefMarkdown: text("brief_markdown").notNull().default(""),
    requiredApprovers: text("required_approvers", { enum: RequiredApproversEnum }).notNull().default("both"),
    approvalMode: text("approval_mode", { enum: ApprovalModeEnum }).notNull().default("parallel"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    retainedArchivedAt: timestamp("retained_archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_projects_id_org_id").on(table.id, table.orgId),
    uniqueIndex("idx_projects_org_status").on(table.orgId, table.status),
  ]
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
