"use server";

import { db } from "../db";
import { employeeCapacitySchedules, capacityAdjustments } from "../db/schema/operational";
import { users, contentAssignments, contentItems, projects } from "../db/schema";
import { getAuthoritativeUser } from "../auth/session";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  EmployeeCapacitySchedule,
  CapacityAdjustment,
} from "../types";
import {
  calculateEmployeePeriodCapacity,
  getPeriodDateRange,
  getCapacityStatus,
  CapacityStatus,
  getTaskPlannedHours,
} from "../calculations/operationalEngine";
import { invalidateWorkspaceEntities } from "./revalidation";

export async function getEmployeeCapacityScheduleAction(userId: string): Promise<{
  success: boolean;
  schedules: EmployeeCapacitySchedule[];
  adjustments: CapacityAdjustment[];
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, schedules: [], adjustments: [], error: "Unauthorized" };

    const schedules = await db
      .select()
      .from(employeeCapacitySchedules)
      .where(and(eq(employeeCapacitySchedules.userId, userId), eq(employeeCapacitySchedules.orgId, authUser.orgId)))
      .orderBy(desc(employeeCapacitySchedules.effectiveFrom));

    const adjustments = await db
      .select()
      .from(capacityAdjustments)
      .where(and(eq(capacityAdjustments.userId, userId), eq(capacityAdjustments.orgId, authUser.orgId)))
      .orderBy(desc(capacityAdjustments.adjustmentDate));

    return {
      success: true,
      schedules: schedules.map((s) => ({
        id: s.id,
        orgId: s.orgId,
        userId: s.userId,
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo,
        mondayHours: Number(s.mondayHours),
        tuesdayHours: Number(s.tuesdayHours),
        wednesdayHours: Number(s.wednesdayHours),
        thursdayHours: Number(s.thursdayHours),
        fridayHours: Number(s.fridayHours),
        saturdayHours: Number(s.saturdayHours),
        sundayHours: Number(s.sundayHours),
        primaryFunction: s.primaryFunction,
        creativeEligibility: s.creativeEligibility as "primary" | "backup" | "not_eligible",
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      adjustments: adjustments.map((a) => ({
        id: a.id,
        orgId: a.orgId,
        userId: a.userId,
        adjustmentDate: a.adjustmentDate,
        kind: a.kind as "leave" | "holiday" | "overtime" | "manual",
        adjustmentHours: Number(a.adjustmentHours),
        reason: a.reason,
        createdByUserId: a.createdByUserId || undefined,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  } catch (error: any) {
    return { success: false, schedules: [], adjustments: [], error: error.message };
  }
}

export async function updateEmployeeCapacityScheduleAction(params: {
  userId: string;
  mondayHours: number;
  tuesdayHours: number;
  wednesdayHours: number;
  thursdayHours: number;
  fridayHours: number;
  saturdayHours: number;
  sundayHours: number;
  primaryFunction: string;
  creativeEligibility: "primary" | "backup" | "not_eligible";
  effectiveFrom?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole !== "founder" && authUser.organizationRole !== "admin") {
      return { success: false, error: "Forbidden: Only Founder or Admin can update Capacity Schedules" };
    }

    const effectiveDate = params.effectiveFrom || new Date().toISOString().split("T")[0];

    // Close any previous open-ended schedule by setting effectiveTo
    await db
      .update(employeeCapacitySchedules)
      .set({ effectiveTo: effectiveDate, updatedAt: new Date() })
      .where(
        and(
          eq(employeeCapacitySchedules.userId, params.userId),
          eq(employeeCapacitySchedules.orgId, authUser.orgId),
          sql`${employeeCapacitySchedules.effectiveTo} IS NULL`
        )
      );

    // Insert new schedule with effectiveFrom
    await db.insert(employeeCapacitySchedules).values({
      orgId: authUser.orgId,
      userId: params.userId,
      effectiveFrom: effectiveDate,
      effectiveTo: null,
      mondayHours: params.mondayHours.toFixed(2),
      tuesdayHours: params.tuesdayHours.toFixed(2),
      wednesdayHours: params.wednesdayHours.toFixed(2),
      thursdayHours: params.thursdayHours.toFixed(2),
      fridayHours: params.fridayHours.toFixed(2),
      saturdayHours: params.saturdayHours.toFixed(2),
      sundayHours: params.sundayHours.toFixed(2),
      primaryFunction: params.primaryFunction,
      creativeEligibility: params.creativeEligibility,
    });

    await invalidateWorkspaceEntities({ orgId: authUser.orgId, tags: ["performance", "capacity", "team"] });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function recordCapacityAdjustmentAction(params: {
  userId: string;
  adjustmentDate: string; // 'YYYY-MM-DD'
  kind: "leave" | "holiday" | "overtime" | "manual";
  adjustmentHours: number; // positive or negative
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole !== "founder" && authUser.organizationRole !== "admin") {
      return { success: false, error: "Forbidden: Only Founder or Admin can record Capacity Adjustments" };
    }

    await db.insert(capacityAdjustments).values({
      orgId: authUser.orgId,
      userId: params.userId,
      adjustmentDate: params.adjustmentDate,
      kind: params.kind,
      adjustmentHours: params.adjustmentHours.toFixed(2),
      reason: params.reason,
      createdByUserId: authUser.id,
    });

    await invalidateWorkspaceEntities({ orgId: authUser.orgId, tags: ["performance", "capacity", "team"] });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCapacityAdjustmentAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole !== "founder" && authUser.organizationRole !== "admin") {
      return { success: false, error: "Forbidden: Only Founder or Admin can delete adjustments" };
    }

    await db
      .delete(capacityAdjustments)
      .where(and(eq(capacityAdjustments.id, id), eq(capacityAdjustments.orgId, authUser.orgId)));

    await invalidateWorkspaceEntities({ orgId: authUser.orgId, tags: ["performance", "capacity", "team"] });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export interface AssigneeCapacityOption {
  userId: string;
  name: string;
  role: string;
  primaryFunction: string;
  creativeEligibility: "primary" | "backup" | "not_eligible";
  assignedHours: number;
  finalCapacityHours: number;
  allocationPercent: number;
  capacityStatus: CapacityStatus;
  isRecommended: boolean;
}

export async function getEligibleAssigneesWithCapacityAction(
  targetDate?: string
): Promise<{
  success: boolean;
  assignees: AssigneeCapacityOption[];
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, assignees: [], error: "Unauthorized" };

    const refDate = targetDate ? new Date(targetDate) : new Date();
    const period = getPeriodDateRange("this_week", undefined, undefined, refDate);

    // 1. Fetch active team members
    const teamMembers = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, authUser.orgId), eq(users.status, "active"), sql`${users.organizationRole} != 'client'`));

    // 2. Fetch schedules and adjustments
    const schedules = await db.select().from(employeeCapacitySchedules).where(eq(employeeCapacitySchedules.orgId, authUser.orgId));
    const adjustments = await db.select().from(capacityAdjustments).where(eq(capacityAdjustments.orgId, authUser.orgId));

    // 3. Fetch active content items and assignments in period
    const items = await db.select().from(contentItems).where(eq(contentItems.orgId, authUser.orgId));
    const assignments = await db.select().from(contentAssignments).where(eq(contentAssignments.orgId, authUser.orgId));

    const mappedSchedules: EmployeeCapacitySchedule[] = schedules.map((s) => ({
      id: s.id,
      orgId: s.orgId,
      userId: s.userId,
      effectiveFrom: s.effectiveFrom,
      effectiveTo: s.effectiveTo,
      mondayHours: Number(s.mondayHours),
      tuesdayHours: Number(s.tuesdayHours),
      wednesdayHours: Number(s.wednesdayHours),
      thursdayHours: Number(s.thursdayHours),
      fridayHours: Number(s.fridayHours),
      saturdayHours: Number(s.saturdayHours),
      sundayHours: Number(s.sundayHours),
      primaryFunction: s.primaryFunction,
      creativeEligibility: s.creativeEligibility as "primary" | "backup" | "not_eligible",
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    const mappedAdjustments: CapacityAdjustment[] = adjustments.map((a) => ({
      id: a.id,
      orgId: a.orgId,
      userId: a.userId,
      adjustmentDate: a.adjustmentDate,
      kind: a.kind as "leave" | "holiday" | "overtime" | "manual",
      adjustmentHours: Number(a.adjustmentHours),
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
    }));

    const assignees: AssigneeCapacityOption[] = teamMembers.map((member) => {
      const cap = calculateEmployeePeriodCapacity(
        member.id,
        period.startDate,
        period.endDate,
        mappedSchedules,
        mappedAdjustments
      );

      // Filter tasks assigned to this user in the period
      const memberAssignments = assignments.filter((a) => a.assigneeUserId === member.id);
      const itemIds = new Set(memberAssignments.map((a) => a.contentItemId));
      const memberItems = items.filter((i) => {
        if (!itemIds.has(i.id) && i.accountOwnerId !== member.id) return false;
        const d = i.finalInternalDeadline || i.calculatedInternalDeadline || i.scheduledPublicationDate || i.createdAt;
        const dStr = d ? d.toISOString().split("T")[0] : "";
        return dStr >= period.startDate && dStr <= period.endDate;
      });

      const assignedHours = memberItems.reduce((sum, item) => sum + getTaskPlannedHours(item as any), 0);
      const allocationPercent = cap.finalCapacityHours > 0 ? (assignedHours / cap.finalCapacityHours) * 100 : 0;
      const capacityStatus = getCapacityStatus(allocationPercent);
      const isRecommended = cap.creativeEligibility === "primary" && (capacityStatus === "Available" || capacityStatus === "Underallocated");

      return {
        userId: member.id,
        name: member.fullName,
        role: member.organizationRole,
        primaryFunction: cap.primaryFunction,
        creativeEligibility: cap.creativeEligibility,
        assignedHours: Math.round(assignedHours * 100) / 100,
        finalCapacityHours: cap.finalCapacityHours,
        allocationPercent: Math.round(allocationPercent * 10) / 10,
        capacityStatus,
        isRecommended,
      };
    });

    // Sort: primary eligible first, then lowest allocation
    assignees.sort((a, b) => {
      if (a.creativeEligibility === "primary" && b.creativeEligibility !== "primary") return -1;
      if (a.creativeEligibility !== "primary" && b.creativeEligibility === "primary") return 1;
      return a.allocationPercent - b.allocationPercent;
    });

    return { success: true, assignees };
  } catch (error: any) {
    return { success: false, assignees: [], error: error.message };
  }
}
