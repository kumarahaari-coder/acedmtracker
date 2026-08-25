import { pgTable, uuid, varchar, text, timestamp, foreignKey, unique, jsonb } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";
import { contentItems } from "./content";

/**
 * 1. Content Assignments Table
 * Authoritative deliverable ownership engine.
 */
export const contentAssignments = pgTable(
  "content_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    assigneeUserId: uuid("assignee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignmentRole: varchar("assignment_role", { length: 50 })
      .notNull()
      .default("designer"), // 'designer' | 'video_editor' | 'collaborator'
    status: varchar("status", { length: 50 })
      .notNull()
      .default("assigned"), // 'assigned' | 'accepted' | 'in_progress' | 'submitted' | 'reassigned' | 'completed'
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    initialDueAt: timestamp("initial_due_at", { withTimezone: true }).notNull(),
    currentDueAt: timestamp("current_due_at", { withTimezone: true }).notNull(),
    firstSubmittedAt: timestamp("first_submitted_at", { withTimezone: true }),
    reassignmentReason: text("reassignment_reason"),
    replacedAssignmentId: uuid("replaced_assignment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_content_assignments_project_id").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_content_assignments_project_org",
    }).onDelete("cascade"),
  ]
);

/**
 * 2. Assignment Deadline History Table (Normalized Append-Only)
 */
export const assignmentDeadlineHistory = pgTable(
  "assignment_deadline_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => contentAssignments.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    orgId: uuid("org_id").notNull(),
    previousDueAt: timestamp("previous_due_at", { withTimezone: true }).notNull(),
    newDueAt: timestamp("new_due_at", { withTimezone: true }).notNull(),
    changedByUserId: uuid("changed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_assignment_deadline_history_project_org",
    }).onDelete("cascade"),
  ]
);
