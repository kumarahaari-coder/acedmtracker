import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { projects } from "./projects";
import { campaigns } from "./collaboration";


// --- 1. Master Effort Standards ---
export const effortStandards = pgTable(
  "effort_standards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 100 }).notNull(), // 'Static', 'Carousel', 'Video', 'Content', 'Operations', 'Advertising', 'Web/UI', 'Non-Creative'
    workType: varchar("work_type", { length: 100 }).notNull(),
    contentSeconds: integer("content_seconds").notNull().default(0),
    productionSeconds: integer("production_seconds").notNull().default(0),
    totalSeconds: integer("total_seconds").notNull().default(0),
    leadTimeWorkdays: integer("lead_time_workdays").notNull().default(2),
    defaultRole: varchar("default_role", { length: 50 }).notNull().default("designer"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgWorkTypeVersionIdx: uniqueIndex("uq_effort_standards_org_work_type_version").on(
      table.orgId,
      table.workType,
      table.version
    ),
    orgCategoryIdx: index("idx_effort_standards_org_cat").on(table.orgId, table.category),
    activeIdx: index("idx_effort_standards_active").on(table.orgId, table.active),
  })
);

// --- 2. Employee Capacity Schedules (Historical Versioning) ---
export const employeeCapacitySchedules = pgTable(
  "employee_capacity_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull().default(sql`CURRENT_DATE`),
    effectiveTo: date("effective_to"), // Null indicates current open-ended schedule
    mondayHours: numeric("monday_hours", { precision: 4, scale: 2 }).notNull().default("8.00"),
    tuesdayHours: numeric("tuesday_hours", { precision: 4, scale: 2 }).notNull().default("8.00"),
    wednesdayHours: numeric("wednesday_hours", { precision: 4, scale: 2 }).notNull().default("8.00"),
    thursdayHours: numeric("thursday_hours", { precision: 4, scale: 2 }).notNull().default("8.00"),
    fridayHours: numeric("friday_hours", { precision: 4, scale: 2 }).notNull().default("8.00"),
    saturdayHours: numeric("saturday_hours", { precision: 4, scale: 2 }).notNull().default("0.00"),
    sundayHours: numeric("sunday_hours", { precision: 4, scale: 2 }).notNull().default("0.00"),
    primaryFunction: varchar("primary_function", { length: 100 }).notNull().default("Creative"),
    creativeEligibility: varchar("creative_eligibility", { length: 50 }).notNull().default("primary"), // 'primary' | 'backup' | 'not_eligible'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userScheduleIdx: index("idx_emp_capacity_user_dates").on(table.userId, table.effectiveFrom, table.effectiveTo),
    orgUserIdx: index("idx_emp_capacity_org_user").on(table.orgId, table.userId),
  })
);

// --- 3. Dated Capacity Adjustments ---
export const capacityAdjustments = pgTable(
  "capacity_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    adjustmentDate: date("adjustment_date").notNull(),
    kind: varchar("kind", { length: 50 }).notNull(), // 'leave' | 'holiday' | 'overtime' | 'manual'
    adjustmentHours: numeric("adjustment_hours", { precision: 4, scale: 2 }).notNull(), // positive for OT, negative for leave/holiday
    reason: text("reason").notNull().default(""),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userDateIdx: index("idx_capacity_adj_user_date").on(table.userId, table.adjustmentDate),
    orgDateIdx: index("idx_capacity_adj_org_date").on(table.orgId, table.adjustmentDate),
  })
);

// --- 4. Project Monthly Commitments ---
export const projectCommitments = pgTable(
  "project_commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    workTypeId: uuid("work_type_id").references(() => effortStandards.id, { onDelete: "set null" }),
    workTypeName: varchar("work_type_name", { length: 100 }).notNull(),
    committedQuantity: integer("committed_quantity").notNull().default(0),
    effectiveMonth: date("effective_month").notNull(), // Canonical 1st of month: '2026-09-01'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projWorkTypeMonthIdx: uniqueIndex("uq_project_commitments_proj_work_month").on(
      table.projectId,
      table.workTypeName,
      table.effectiveMonth
    ),
    orgMonthIdx: index("idx_proj_commitments_org_month").on(table.orgId, table.effectiveMonth),
  })
);

// --- 5. Periodic Advertising / Performance Project Inputs ---
export const projectPerformanceInputs = pgTable(
  "project_performance_inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    effectiveMonth: date("effective_month").notNull(), // '2026-09-01'
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    adBudget: numeric("ad_budget", { precision: 12, scale: 2 }).notNull().default("0.00"),
    adSpend: numeric("ad_spend", { precision: 12, scale: 2 }).notNull().default("0.00"),
    leads: integer("leads").notNull().default(0),
    conversions: integer("conversions").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projMonthCampaignIdx: uniqueIndex("uq_proj_perf_inputs_proj_month_camp").on(
      table.projectId,
      table.effectiveMonth,
      table.campaignId
    ),
    orgMonthIdx: index("idx_proj_perf_org_month").on(table.orgId, table.effectiveMonth),
  })
);
