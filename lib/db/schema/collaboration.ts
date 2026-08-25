import { pgTable, uuid, varchar, text, timestamp, boolean, integer, doublePrecision, foreignKey, unique, jsonb } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";
import { contentItems, submissionVersions } from "./content";
import { creativeAssets } from "./assets";

/**
 * 1. Comments Table (Internal & External)
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    submissionVersionId: uuid("submission_version_id")
      .references(() => submissionVersions.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id"),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    externalReviewerName: varchar("external_reviewer_name", { length: 255 }),
    visibility: varchar("visibility", { length: 50 }).notNull().default("internal"), // 'internal' | 'external'
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_comments_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 2. Visual Annotations Table
 */
export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => creativeAssets.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(), // 'point' | 'region' | 'video_timestamp' | 'pdf_page'
    x: doublePrecision("x"),
    y: doublePrecision("y"),
    width: doublePrecision("width"),
    height: doublePrecision("height"),
    timestampSeconds: doublePrecision("timestamp_seconds"),
    pageNumber: integer("page_number"),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_annotations_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 3. External Review Tokens Table (Expiring, Revocable, Tokenized Sandbox)
 */
export const externalReviewTokens = pgTable(
  "external_review_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    submissionVersionId: uuid("submission_version_id")
      .notNull()
      .references(() => submissionVersions.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    allowDownload: boolean("allow_download").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_external_review_tokens_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 4. Audit Records Table (Immutable Append-Only Audit Ledger)
 */
export const auditRecords = pgTable(
  "audit_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id"),
    orgId: uuid("org_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: varchar("actor_name", { length: 255 }).notNull(),
    actorRole: varchar("actor_role", { length: 50 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
    summary: text("summary").notNull(),
    reason: text("reason"),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
  }
);

/**
 * 5. Notifications Table
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_notifications_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 6. Campaigns Table
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    objective: text("objective").notNull().default(""),
    description: text("description").notNull().default(""),
    status: varchar("status", { length: 50 }).notNull().default("planning"), // 'planning' | 'active' | 'completed' | 'paused'
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_campaigns_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 7. Scripts Table
 */
export const scripts = pgTable(
  "scripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    linkedContentItemId: uuid("linked_content_item_id").references(() => contentItems.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    platform: varchar("platform", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("backlog"), // 'backlog' | 'in_progress' | 'ready' | 'linked'
    hook: text("hook").notNull().default(""),
    scenes: jsonb("scenes").notNull().default("[]"),
    cta: text("cta").notNull().default(""),
    notes: text("notes").notNull().default(""),
    musicTrack: varchar("music_track", { length: 255 }),
    musicUrl: text("music_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_scripts_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 8. Analytics Snapshots Table
 */
export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),
    platform: varchar("platform", { length: 50 }).notNull(),
    reach: integer("reach").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    engagementRate: doublePrecision("engagement_rate").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    revenue: doublePrecision("revenue").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_analytics_snapshots_project_org",
    }).onDelete("cascade"),
  ]
);
