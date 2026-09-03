import { pgTable, uuid, varchar, text, timestamp, integer, foreignKey, unique, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";
import { contentItems } from "./content";
import { contentAssignments } from "./assignments";

/**
 * 1. Work Sessions Table (Authoritative Server-Owned Timers)
 */
export const workSessions = pgTable(
  "work_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => contentAssignments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
    activeSegmentStartedAt: timestamp("active_segment_started_at", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("active"), // 'active' | 'paused' | 'completed'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_work_sessions_project_id").on(table.projectId, table.id),
    index("idx_work_sessions_org_started").on(table.orgId, table.startedAt),
    index("idx_work_sessions_item_id").on(table.contentItemId),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_work_sessions_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 2. Work Session Adjustments Table
 */
export const workSessionAdjustments = pgTable(
  "work_session_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workSessionId: uuid("work_session_id")
      .notNull()
      .references(() => workSessions.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    previousDurationSeconds: integer("previous_duration_seconds").notNull(),
    adjustedDurationSeconds: integer("adjusted_duration_seconds").notNull(),
    reason: text("reason").notNull(),
    adjustedByUserId: uuid("adjusted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    adjustedAt: timestamp("adjusted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_work_session_adjustments_project_org",
    }).onDelete("cascade"),
  ]
);
