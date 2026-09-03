"use server";

import { db } from "../db";
import { scripts, contentItems, projects } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { Script } from "../types";
import { generateLegacyId } from "../compat/resolver";

export async function getScriptsAction(projectId: string, actorUserId?: string): Promise<{
  success: boolean;
  scripts: Script[];
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) return { success: false, scripts: [], error: "Unauthorized" };

    const rows = await db
      .select()
      .from(scripts)
      .where(and(eq(scripts.projectId, projectId), eq(scripts.orgId, authUser.orgId)));

    const mapped: Script[] = rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      campaignId: r.campaignId || undefined,
      linkedContentItemId: r.linkedContentItemId || undefined,
      title: r.title,
      platform: r.platform as any,
      status: r.status as any,
      hook: r.hook,
      scenes: (r.scenes as any) || [],
      cta: r.cta,
      notes: r.notes,
      musicTrack: r.musicTrack || undefined,
      musicUrl: r.musicUrl || undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return { success: true, scripts: mapped };
  } catch (err: any) {
    return { success: false, scripts: [], error: err.message };
  }
}

export async function createScriptAction(params: {
  actorUserId?: string;
  projectId: string;
  title: string;
  platform: string;
  linkedContentItemId?: string;
  hook?: string;
  scenes?: any[];
  cta?: string;
  notes?: string;
}): Promise<{ success: boolean; script?: Script; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser(params.actorUserId);
    if (!authUser) return { success: false, error: "Unauthorized" };

    const [created] = await db
      .insert(scripts)
      .values({
        legacyId: generateLegacyId("scr"),
        projectId: params.projectId,
        orgId: authUser.orgId,
        linkedContentItemId: params.linkedContentItemId || null,
        title: params.title.trim(),
        platform: params.platform,
        status: params.linkedContentItemId ? "linked" : "ready",
        hook: params.hook || "",
        scenes: params.scenes || [],
        cta: params.cta || "",
        notes: params.notes || "",
      })
      .returning();

    const mapped: Script = {
      id: created.id,
      projectId: created.projectId,
      campaignId: created.campaignId || undefined,
      linkedContentItemId: created.linkedContentItemId || undefined,
      title: created.title,
      platform: created.platform as any,
      status: created.status as any,
      hook: created.hook,
      scenes: (created.scenes as any) || [],
      cta: created.cta,
      notes: created.notes,
      musicTrack: created.musicTrack || undefined,
      musicUrl: created.musicUrl || undefined,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    return { success: true, script: mapped };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateScriptAction(params: {
  actorUserId?: string;
  scriptId: string;
  title?: string;
  platform?: string;
  linkedContentItemId?: string | null;
  hook?: string;
  scenes?: any[];
  cta?: string;
  notes?: string;
  status?: string;
}): Promise<{ success: boolean; script?: Script; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser(params.actorUserId);
    if (!authUser) return { success: false, error: "Unauthorized" };

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (params.title !== undefined) updates.title = params.title.trim();
    if (params.platform !== undefined) updates.platform = params.platform;
    if (params.linkedContentItemId !== undefined) {
      updates.linkedContentItemId = params.linkedContentItemId;
      updates.status = params.linkedContentItemId ? "linked" : "ready";
    }
    if (params.hook !== undefined) updates.hook = params.hook;
    if (params.scenes !== undefined) updates.scenes = params.scenes;
    if (params.cta !== undefined) updates.cta = params.cta;
    if (params.notes !== undefined) updates.notes = params.notes;
    if (params.status !== undefined) updates.status = params.status;

    const [updated] = await db
      .update(scripts)
      .set(updates)
      .where(and(eq(scripts.id, params.scriptId), eq(scripts.orgId, authUser.orgId)))
      .returning();

    if (!updated) return { success: false, error: "Script not found" };

    const mapped: Script = {
      id: updated.id,
      projectId: updated.projectId,
      campaignId: updated.campaignId || undefined,
      linkedContentItemId: updated.linkedContentItemId || undefined,
      title: updated.title,
      platform: updated.platform as any,
      status: updated.status as any,
      hook: updated.hook,
      scenes: (updated.scenes as any) || [],
      cta: updated.cta,
      notes: updated.notes,
      musicTrack: updated.musicTrack || undefined,
      musicUrl: updated.musicUrl || undefined,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return { success: true, script: mapped };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function linkScriptToContentItemAction(params: {
  actorUserId?: string;
  scriptId: string;
  contentItemId: string | null;
}): Promise<{ success: boolean; script?: Script; error?: string }> {
  return updateScriptAction({
    actorUserId: params.actorUserId,
    scriptId: params.scriptId,
    linkedContentItemId: params.contentItemId,
  });
}
