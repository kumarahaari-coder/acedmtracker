"use server";

import { db } from "../db";
import { effortStandards } from "../db/schema/operational";
import { getAuthoritativeUser } from "../auth/session";
import { eq, and, desc, sql } from "drizzle-orm";
import { EffortStandard } from "../types";
import { invalidateWorkspaceEntities } from "./revalidation";
import { invalidateCachedEffortStandards } from "../cache/effortStandardsCache";

export async function getEffortStandardsAction(): Promise<{
  success: boolean;
  standards: EffortStandard[];
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, standards: [], error: "Unauthorized" };

    const rows = await db
      .select()
      .from(effortStandards)
      .where(eq(effortStandards.orgId, authUser.orgId))
      .orderBy(effortStandards.category, effortStandards.workType);

    const mapped: EffortStandard[] = rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      category: r.category,
      workType: r.workType,
      contentSeconds: r.contentSeconds,
      productionSeconds: r.productionSeconds,
      totalSeconds: r.totalSeconds,
      leadTimeWorkdays: r.leadTimeWorkdays,
      defaultRole: r.defaultRole,
      active: r.active,
      version: r.version,
      effectiveFrom: r.effectiveFrom.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return { success: true, standards: mapped };
  } catch (error: any) {
    return { success: false, standards: [], error: error.message };
  }
}

export async function createEffortStandardAction(params: {
  category: string;
  workType: string;
  contentHours: number;
  productionHours: number;
  leadTimeWorkdays: number;
  defaultRole: string;
}): Promise<{ success: boolean; standard?: EffortStandard; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole !== "founder" && authUser.organizationRole !== "admin") {
      return { success: false, error: "Forbidden: Only Founder or Admin can create Effort Standards" };
    }

    const contentSeconds = Math.round(params.contentHours * 3600);
    const productionSeconds = Math.round(params.productionHours * 3600);
    const totalSeconds = contentSeconds + productionSeconds;

    const [created] = await db
      .insert(effortStandards)
      .values({
        orgId: authUser.orgId,
        category: params.category.trim(),
        workType: params.workType.trim(),
        contentSeconds,
        productionSeconds,
        totalSeconds,
        leadTimeWorkdays: params.leadTimeWorkdays,
        defaultRole: params.defaultRole.trim(),
        active: true,
        version: 1,
      })
      .returning();

    await invalidateWorkspaceEntities({ orgId: authUser.orgId, tags: ["performance", "effort_standards"] });
    invalidateCachedEffortStandards(authUser.orgId);

    return {
      success: true,
      standard: {
        id: created.id,
        orgId: created.orgId,
        category: created.category,
        workType: created.workType,
        contentSeconds: created.contentSeconds,
        productionSeconds: created.productionSeconds,
        totalSeconds: created.totalSeconds,
        leadTimeWorkdays: created.leadTimeWorkdays,
        defaultRole: created.defaultRole,
        active: created.active,
        version: created.version,
        effectiveFrom: created.effectiveFrom.toISOString(),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateEffortStandardAction(params: {
  id: string;
  contentHours: number;
  productionHours: number;
  leadTimeWorkdays: number;
  defaultRole?: string;
  active?: boolean;
}): Promise<{ success: boolean; standard?: EffortStandard; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole !== "founder" && authUser.organizationRole !== "admin") {
      return { success: false, error: "Forbidden: Only Founder or Admin can update Effort Standards" };
    }

    const [existing] = await db
      .select()
      .from(effortStandards)
      .where(and(eq(effortStandards.id, params.id), eq(effortStandards.orgId, authUser.orgId)))
      .limit(1);

    if (!existing) return { success: false, error: "Standard not found" };

    const contentSeconds = Math.round(params.contentHours * 3600);
    const productionSeconds = Math.round(params.productionHours * 3600);
    const totalSeconds = contentSeconds + productionSeconds;

    // Check if effort changed - if so, version it to preserve history!
    const effortChanged =
      contentSeconds !== existing.contentSeconds ||
      productionSeconds !== existing.productionSeconds ||
      params.leadTimeWorkdays !== existing.leadTimeWorkdays;

    let updatedRow: typeof existing;

    if (effortChanged) {
      // Deactivate older version
      await db
        .update(effortStandards)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(effortStandards.id, existing.id));

      // Insert new version
      const [newVersion] = await db
        .insert(effortStandards)
        .values({
          orgId: authUser.orgId,
          category: existing.category,
          workType: existing.workType,
          contentSeconds,
          productionSeconds,
          totalSeconds,
          leadTimeWorkdays: params.leadTimeWorkdays,
          defaultRole: params.defaultRole || existing.defaultRole,
          active: params.active !== undefined ? params.active : true,
          version: existing.version + 1,
          effectiveFrom: new Date(),
        })
        .returning();
      updatedRow = newVersion;
    } else {
      // Simple metadata update without version bump
      const [updated] = await db
        .update(effortStandards)
        .set({
          defaultRole: params.defaultRole || existing.defaultRole,
          active: params.active !== undefined ? params.active : existing.active,
          updatedAt: new Date(),
        })
        .where(eq(effortStandards.id, existing.id))
        .returning();
      updatedRow = updated;
    }

    await invalidateWorkspaceEntities({ orgId: authUser.orgId, tags: ["performance", "effort_standards"] });
    invalidateCachedEffortStandards(authUser.orgId);

    return {
      success: true,
      standard: {
        id: updatedRow.id,
        orgId: updatedRow.orgId,
        category: updatedRow.category,
        workType: updatedRow.workType,
        contentSeconds: updatedRow.contentSeconds,
        productionSeconds: updatedRow.productionSeconds,
        totalSeconds: updatedRow.totalSeconds,
        leadTimeWorkdays: updatedRow.leadTimeWorkdays,
        defaultRole: updatedRow.defaultRole,
        active: updatedRow.active,
        version: updatedRow.version,
        effectiveFrom: updatedRow.effectiveFrom.toISOString(),
        createdAt: updatedRow.createdAt.toISOString(),
        updatedAt: updatedRow.updatedAt.toISOString(),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
