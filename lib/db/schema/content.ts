import { pgTable, uuid, varchar, text, timestamp, boolean, integer, unique, foreignKey, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";

export type ContentPlatform = "Instagram" | "Facebook" | "LinkedIn" | "YouTube" | "X" | "Email";
export type ContentType = "post" | "carousel" | "reel" | "trial_reel";
export type ContentStage =
  | "idea"
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "insights_pending"
  | "reported";
export type ScopeClassification = "contracted" | "goodwill" | "additional_billable";
export type ContentStatus = "active" | "archived" | "trash";

// 1. Content Groups (Multi-Platform Campaign Groups)
export const contentGroups = pgTable(
  "content_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    conceptNotes: text("concept_notes"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    deletionReason: text("deletion_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_content_groups_project_id_id").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_content_groups_project_org",
    }).onDelete("cascade"),
  ]
);

// 2. Content Items (Platform-Specific Content Records)
// NOTE: Ownership/Assignment fields intentionally removed in accordance with approved architecture.
export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    contentGroupId: uuid("content_group_id").references(() => contentGroups.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    platform: varchar("platform", { length: 50 }).notNull().$type<ContentPlatform>(),
    contentType: varchar("content_type", { length: 50 }).notNull().$type<ContentType>(),
    stage: varchar("stage", { length: 50 }).notNull().default("draft").$type<ContentStage>(),
    scopeClassification: varchar("scope_classification", { length: 50 })
      .notNull()
      .default("contracted")
      .$type<ScopeClassification>(),
    clientVisible: boolean("client_visible").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    liveUrl: text("live_url"),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    currentVersionNumber: integer("current_version_number").notNull().default(1),
    submissionDeadline: timestamp("submission_deadline", { withTimezone: true }),
    resubmissionDeadline: timestamp("resubmission_deadline", { withTimezone: true }),
    approvalTarget: timestamp("approval_target", { withTimezone: true }),
    scheduledPublicationDate: timestamp("scheduled_publication_date", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("active").$type<ContentStatus>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    deletionReason: text("deletion_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    workType: varchar("work_type", { length: 100 }),
    workTypeId: uuid("work_type_id"),
    campaignId: uuid("campaign_id"),
    contentPillar: varchar("content_pillar", { length: 100 }),
    topic: varchar("topic", { length: 255 }),
    brief: text("brief"),
    referenceLink: text("reference_link"),
    figmaUrl: text("figma_url"),
    clientDeliveryDate: timestamp("client_delivery_date", { withTimezone: true }),
    priority: varchar("priority", { length: 50 }),
    workNature: varchar("work_nature", { length: 50 }),
    accountOwnerId: uuid("account_owner_id"),
    calculatedInternalDeadline: timestamp("calculated_internal_deadline", { withTimezone: true }),
    finalInternalDeadline: timestamp("final_internal_deadline", { withTimezone: true }),
    deadlineOverrideReason: text("deadline_override_reason"),
    standardContentSeconds: integer("standard_content_seconds"),
    standardProductionSeconds: integer("standard_production_seconds"),
    revisionContentSeconds: integer("revision_content_seconds"),
    revisionProductionSeconds: integer("revision_production_seconds"),
    finalPlannedSeconds: integer("final_planned_seconds"),
    isEffortAnchor: boolean("is_effort_anchor").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("uq_content_items_project_id_id").on(table.projectId, table.id),
    index("idx_content_items_proj_deleted").on(table.projectId, table.deletedAt),
    index("idx_content_items_org_deleted").on(table.orgId, table.deletedAt),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_content_items_project_org",
    }).onDelete("cascade"),
  ]
);

// 3. Submission Versions (Sequential Immutable Submissions)
export const submissionVersions = pgTable(
  "submission_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    isDraft: boolean("is_draft").notNull().default(true),
    caption: text("caption").notNull().default(""),
    hashtags: text("hashtags").array().notNull().default([]),
    cta: text("cta").notNull().default(""),
    destinationUrl: text("destination_url"),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
    copyFingerprint: varchar("copy_fingerprint", { length: 64 }).notNull().default(""),
    creativeFingerprint: varchar("creative_fingerprint", { length: 64 }).notNull().default(""),
    postingDateFingerprint: varchar("posting_date_fingerprint", { length: 64 }).notNull().default(""),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_submission_versions_item_version").on(table.contentItemId, table.versionNumber),
    unique("uq_submission_versions_project_id_id").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_submission_versions_project_org",
    }).onDelete("cascade"),
  ]
);
