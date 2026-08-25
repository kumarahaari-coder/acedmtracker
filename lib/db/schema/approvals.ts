import { pgTable, uuid, varchar, text, timestamp, foreignKey, unique, boolean } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";
import { contentItems, submissionVersions } from "./content";
import { creativeAssets } from "./assets";

/**
 * 1. Approval Decisions Table (Append-Only Historical Review Ledger)
 */
export const approvalDecisions = pgTable(
  "approval_decisions",
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
    component: varchar("component", { length: 50 }).notNull(), // 'copy' | 'creative' | 'posting_date'
    componentFingerprint: varchar("component_fingerprint", { length: 64 }).notNull(),
    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewerRole: varchar("reviewer_role", { length: 50 }).notNull(), // 'founder' | 'consultant'
    decision: varchar("decision", { length: 50 }).notNull(), // 'pending' | 'approved' | 'changes_requested' | 'approved_with_conditions'
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_approval_decisions_project_id").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_approval_decisions_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 2. Founder Overrides Table (Append-Only Emergency Bypass Ledger)
 */
export const founderOverrides = pgTable(
  "founder_overrides",
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
    component: varchar("component", { length: 50 }), // optional: if null, applies to whole submission
    reason: text("reason").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_founder_overrides_project_id").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_founder_overrides_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 3. Change Requests Table
 */
export const changeRequests = pgTable(
  "change_requests",
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
    component: varchar("component", { length: 50 }).notNull(), // 'copy' | 'creative' | 'posting_date'
    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestedChange: text("requested_change").notNull(),
    priority: varchar("priority", { length: 50 }).notNull().default("medium"), // 'low' | 'medium' | 'high' | 'blocker'
    status: varchar("status", { length: 50 }).notNull().default("open"), // 'open' | 'addressed' | 'resolved' | 'waived' | 'disputed'
    resolutionReason: text("resolution_reason"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_change_requests_project_id").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_change_requests_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 4. Change Request Responses Table (Append-Only Thread)
 */
export const changeRequestResponses = pgTable(
  "change_request_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    changeRequestId: uuid("change_request_id")
      .notNull()
      .references(() => changeRequests.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    responderUserId: uuid("responder_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    responseText: text("response_text").notNull(),
    evidenceAssetId: uuid("evidence_asset_id").references(() => creativeAssets.id, { onDelete: "set null" }),
    addressedInVersionId: uuid("addressed_in_version_id").references(() => submissionVersions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_change_request_responses_project_org",
    }).onDelete("cascade"),
  ]
);
