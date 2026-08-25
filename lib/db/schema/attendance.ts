import { pgTable, uuid, varchar, text, timestamp, foreignKey, unique, date } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * 1. Attendance Records Table
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    attendanceDate: date("attendance_date").notNull(), // 'YYYY-MM-DD'
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).defaultNow().notNull(),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("checked_in"), // 'checked_in' | 'checked_out'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_attendance_user_date").on(table.userId, table.attendanceDate),
  ]
);

/**
 * 2. Attendance Corrections Table
 */
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attendanceRecordId: uuid("attendance_record_id")
      .notNull()
      .references(() => attendanceRecords.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    previousCheckIn: timestamp("previous_check_in", { withTimezone: true }),
    newCheckIn: timestamp("new_check_in", { withTimezone: true }),
    previousCheckOut: timestamp("previous_check_out", { withTimezone: true }),
    newCheckOut: timestamp("new_check_out", { withTimezone: true }),
    changedByUserId: uuid("changed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);
