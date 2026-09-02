"use server";

import { db } from "../db";
import { projectCommitments, projectPerformanceInputs, effortStandards } from "../db/schema/operational";
import { projects } from "../db/schema/projects";
import { getAuthoritativeUser } from "../auth/session";
import { eq, and, desc, sql } from "drizzle-orm";
import { ProjectCommitment, ProjectPerformanceInput } from "../types";
import { invalidateWorkspaceEntities } from "./revalidation";

export async function getProjectCommitmentsAction(
  projectId: string,
  monthDate?: string // 'YYYY-MM-DD'
): Promise<{
  success: boolean;
  commitments: ProjectCommitment[];
  perfInput?: ProjectPerformanceInput;
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, commitments: [], error: "Unauthorized" };

    const targetMonth = monthDate ? `${monthDate.slice(0, 7)}-01` : `${new Date().toISOString().slice(0, 7)}-01`;

    const rows = await db
      .select()
      .from(projectCommitments)
      .where(
        and(
          eq(projectCommitments.projectId, projectId),
          eq(projectCommitments.orgId, authUser.orgId),
          eq(projectCommitments.effectiveMonth, targetMonth)
        )
      );

    const [perfRow] = await db
      .select()
      .from(projectPerformanceInputs)
      .where(
        and(
          eq(projectPerformanceInputs.projectId, projectId),
          eq(projectPerformanceInputs.orgId, authUser.orgId),
          eq(projectPerformanceInputs.effectiveMonth, targetMonth)
        )
      )
      .limit(1);

    const mappedCommitments: ProjectCommitment[] = rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      projectId: r.projectId,
      workTypeId: r.workTypeId || undefined,
      workTypeName: r.workTypeName,
      committedQuantity: r.committedQuantity,
      effectiveMonth: r.effectiveMonth,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const mappedPerfInput: ProjectPerformanceInput | undefined = perfRow
      ? {
          id: perfRow.id,
          orgId: perfRow.orgId,
          projectId: perfRow.projectId,
          campaignId: perfRow.campaignId || undefined,
          effectiveMonth: perfRow.effectiveMonth,
          currency: perfRow.currency,
          adBudget: Number(perfRow.adBudget),
          adSpend: Number(perfRow.adSpend),
          leads: perfRow.leads,
          conversions: perfRow.conversions,
          createdAt: perfRow.createdAt.toISOString(),
          updatedAt: perfRow.updatedAt.toISOString(),
        }
      : undefined;

    return {
      success: true,
      commitments: mappedCommitments,
      perfInput: mappedPerfInput,
    };
  } catch (error: any) {
    return { success: false, commitments: [], error: error.message };
  }
}

export async function upsertProjectCommitmentAction(params: {
  projectId: string;
  workTypeName: string;
  workTypeId?: string;
  committedQuantity: number;
  effectiveMonth: string; // 'YYYY-MM-01'
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole === "client") {
      return { success: false, error: "Forbidden: Clients cannot configure commitments" };
    }

    const canonicalMonth = `${params.effectiveMonth.slice(0, 7)}-01`;

    await db
      .insert(projectCommitments)
      .values({
        orgId: authUser.orgId,
        projectId: params.projectId,
        workTypeName: params.workTypeName.trim(),
        workTypeId: params.workTypeId || null,
        committedQuantity: Math.max(0, params.committedQuantity),
        effectiveMonth: canonicalMonth,
      })
      .onConflictDoUpdate({
        target: [projectCommitments.projectId, projectCommitments.workTypeName, projectCommitments.effectiveMonth],
        set: {
          committedQuantity: Math.max(0, params.committedQuantity),
          workTypeId: params.workTypeId || null,
          updatedAt: new Date(),
        },
      });

    await invalidateWorkspaceEntities({ orgId: authUser.orgId, tags: ["performance", "commitments", "projects"] });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function upsertProjectPerformanceInputAction(params: {
  projectId: string;
  effectiveMonth: string; // 'YYYY-MM-01'
  currency: string;
  adBudget: number;
  adSpend: number;
  leads: number;
  conversions: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole === "client") {
      return { success: false, error: "Forbidden" };
    }

    const canonicalMonth = `${params.effectiveMonth.slice(0, 7)}-01`;

    await db
      .insert(projectPerformanceInputs)
      .values({
        orgId: authUser.orgId,
        projectId: params.projectId,
        effectiveMonth: canonicalMonth,
        currency: params.currency || "INR",
        adBudget: params.adBudget.toFixed(2),
        adSpend: params.adSpend.toFixed(2),
        leads: Math.max(0, params.leads),
        conversions: Math.max(0, params.conversions),
      })
      .onConflictDoUpdate({
        target: [projectPerformanceInputs.projectId, projectPerformanceInputs.effectiveMonth, projectPerformanceInputs.campaignId],
        set: {
          currency: params.currency || "INR",
          adBudget: params.adBudget.toFixed(2),
          adSpend: params.adSpend.toFixed(2),
          leads: Math.max(0, params.leads),
          conversions: Math.max(0, params.conversions),
          updatedAt: new Date(),
        },
      });

    await invalidateWorkspaceEntities({ orgId: authUser.orgId, tags: ["performance", "projects"] });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
