import { pgTable, uuid, varchar, text, timestamp, boolean, bigint, integer, unique, foreignKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";
import { submissionVersions } from "./content";

export type AssetUploadStatus = "pending" | "ready" | "failed" | "expired";

// 1. Creative Assets (Vault of Binary Assets stored in Cloudflare R2)
export const creativeAssets = pgTable(
  "creative_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: varchar("legacy_id", { length: 100 }).unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    r2ObjectKey: text("r2_object_key").notNull().unique(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 50 }).notNull().default("pending").$type<AssetUploadStatus>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isDriveLink: boolean("is_drive_link").notNull().default(false),
    driveUrl: text("drive_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_creative_assets_project_id_id").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.orgId],
      foreignColumns: [projects.id, projects.orgId],
      name: "fk_creative_assets_project_org",
    }).onDelete("cascade"),
  ]
);

// 2. Submission Assets (Junction between SubmissionVersion and CreativeAsset)
export const submissionAssets = pgTable(
  "submission_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionVersionId: uuid("submission_version_id")
      .notNull()
      .references(() => submissionVersions.id, { onDelete: "cascade" }),
    creativeAssetId: uuid("creative_asset_id")
      .notNull()
      .references(() => creativeAssets.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_submission_assets_version_asset").on(table.submissionVersionId, table.creativeAssetId),
  ]
);
