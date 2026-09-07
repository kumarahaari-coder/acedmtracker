import { db } from "../db";
import {
  contentItems,
  submissionVersions,
  projects,
  projectMemberships,
  users,
} from "../db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireProjectAccess, getAuthoritativeUser } from "../auth/session";

export interface ClientProjectOverviewDTO {
  project: {
    id: string;
    name: string;
    clientBrand: string;
    scope: string;
  };
  summary: {
    upcomingCount: number;
    approvedCount: number;
    scheduledCount: number;
    publishedCount: number;
    totalCreatives: number;
    performance?: Record<string, number>;
  };
  recentCreatives: Array<{
    id: string;
    title: string;
    platform: string;
    contentType: string;
    stage: string;
    scheduledDate: string | null;
    publishedAt: string | null;
    liveUrl?: string | null;
    copy: {
      caption: string;
      hashtags: string[];
      cta: string;
    };
    assets: any[];
  }>;
  upcomingCalendar: Array<{
    id: string;
    title: string;
    platform: string;
    contentType: string;
    status: "scheduled" | "published";
    date: string;
  }>;
}

/**
 * Strict Client Portal Eligibility Predicate
 * Must satisfy BOTH: client_visible = true AND stage IN ('approved', 'scheduled', 'published')
 */
const ELIGIBLE_CLIENT_STAGES = ["approved", "scheduled", "published"] as const;

export async function getAuthoritativeClientOverviewAction(
  projectId: string,
  userId: string
): Promise<{ success: boolean; data?: ClientProjectOverviewDTO; error?: string }> {
  // 1. Authorize User and Project Membership
  const access = await requireProjectAccess(userId, projectId);
  if (!access.allowed) {
    return { success: false, error: "Access denied. You do not have an active membership for this project." };
  }

  // 2. Fetch Project Metadata
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return { success: false, error: "Project not found." };
  }

  // 3. Query PostgreSQL directly for client-eligible content items
  const eligibleItems = await db
    .select()
    .from(contentItems)
    .where(
      and(
        eq(contentItems.projectId, projectId),
        eq(contentItems.clientVisible, true),
        inArray(contentItems.stage, ELIGIBLE_CLIENT_STAGES),
        sql`${contentItems.deletedAt} IS NULL`
      )
    )
    .orderBy(desc(contentItems.scheduledPublicationDate), desc(contentItems.updatedAt));

  // 4. Fetch latest submitted (frozen) submission versions for eligible items
  const itemIds = eligibleItems.map((i) => i.id);
  let versions: any[] = [];
  if (itemIds.length > 0) {
    versions = await db
      .select()
      .from(submissionVersions)
      .where(
        and(
          inArray(submissionVersions.contentItemId, itemIds),
          eq(submissionVersions.isDraft, false)
        )
      )
      .orderBy(desc(submissionVersions.versionNumber));
  }

  // Map latest version per item
  const latestVersionMap = new Map<string, any>();
  for (const v of versions) {
    if (!latestVersionMap.has(v.contentItemId)) {
      latestVersionMap.set(v.contentItemId, v);
    }
  }

  // 5. Calculate summary metrics using the exact same eligibility predicate
  const now = new Date();

  let upcomingCount = 0;
  let approvedCount = 0;
  let scheduledCount = 0;
  let publishedCount = 0;

  const recentCreatives: any[] = [];
  const upcomingCalendar: any[] = [];

  for (const item of eligibleItems) {
    const version = latestVersionMap.get(item.id);
    const copy = {
      caption: version?.caption || item.title || "",
      hashtags: version?.hashtags || [],
      cta: version?.cta || "",
    };

    const isPublished = item.stage === "published" || item.publishedAt !== null;
    const isScheduled = item.stage === "scheduled" || (!isPublished && item.scheduledPublicationDate !== null);
    const isApproved = item.stage === "approved" || isScheduled || isPublished;

    if (isApproved) approvedCount++;
    if (isScheduled) scheduledCount++;
    if (isPublished) publishedCount++;

    if (item.scheduledPublicationDate && new Date(item.scheduledPublicationDate) >= now) {
      upcomingCount++;
      upcomingCalendar.push({
        id: item.id,
        title: item.title,
        platform: item.platform,
        contentType: item.contentType,
        status: isPublished ? "published" : "scheduled",
        date: new Date(item.scheduledPublicationDate).toISOString(),
      });
    }

    recentCreatives.push({
      id: item.id,
      title: item.title,
      platform: item.platform,
      contentType: item.contentType,
      stage: item.stage,
      scheduledDate: item.scheduledPublicationDate ? new Date(item.scheduledPublicationDate).toISOString() : null,
      publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
      copy,
      assets: version?.creativeAssets || [],
    });
  }

  return {
    success: true,
    data: {
      project: {
        id: project.id,
        name: project.name,
        clientBrand: project.clientName || project.name,
        scope: project.briefMarkdown || "Full Creative Content Deliverables",
      },
      summary: {
        upcomingCount,
        approvedCount,
        scheduledCount,
        publishedCount,
        totalCreatives: eligibleItems.length,
      },
      recentCreatives: recentCreatives.slice(0, 10),
      upcomingCalendar,
    },
  };
}

export async function getAuthoritativeClientCreativesAction(
  projectId: string,
  userId: string
) {
  const res = await getAuthoritativeClientOverviewAction(projectId, userId);
  if (!res.success || !res.data) return { success: false, error: res.error || "Failed to load creatives." };
  return { success: true, creatives: res.data.recentCreatives };
}

export async function getAuthoritativeClientCalendarAction(
  projectId: string,
  userId: string
) {
  const res = await getAuthoritativeClientOverviewAction(projectId, userId);
  if (!res.success || !res.data) return { success: false, error: res.error || "Failed to load calendar." };
  return { success: true, calendar: res.data.upcomingCalendar };
}

export interface PortalContextDTO {
  user: {
    id: string;
    fullName: string;
    email: string;
    organizationRole: string;
  };
  projects: Array<{
    id: string;
    name: string;
    clientBrand: string;
    avatar: string;
    timezone: string;
    status: string;
  }>;
}

export async function getAuthoritativePortalContextAction(): Promise<{
  success: boolean;
  data?: PortalContextDTO;
  error?: string;
}> {
  const authUser = await getAuthoritativeUser();
  if (!authUser) {
    return { success: false, error: "Unauthorized" };
  }

  const isInternalAdmin = authUser.organizationRole === "founder" || authUser.organizationRole === "admin";

  let eligibleProjects: any[] = [];
  if (isInternalAdmin) {
    eligibleProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientBrand: projects.clientName,
        status: projects.status,
      })
      .from(projects)
      .where(and(eq(projects.orgId, authUser.orgId), sql`${projects.deletedAt} IS NULL`))
      .orderBy(projects.name);
  } else {
    eligibleProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientBrand: projects.clientName,
        status: projects.status,
      })
      .from(projects)
      .innerJoin(projectMemberships, and(
        eq(projectMemberships.projectId, projects.id),
        eq(projectMemberships.userId, authUser.id),
        eq(projectMemberships.status, "active")
      ))
      .where(and(eq(projects.orgId, authUser.orgId), sql`${projects.deletedAt} IS NULL`))
      .orderBy(projects.name);
  }

  return {
    success: true,
    data: {
      user: {
        id: authUser.id,
        fullName: authUser.fullName,
        email: authUser.email,
        organizationRole: authUser.organizationRole,
      },
      projects: eligibleProjects.map((p) => ({
        id: p.id,
        name: p.name,
        clientBrand: p.clientBrand || p.name,
        avatar: (p.name || "A").charAt(0).toUpperCase(),
        timezone: "Asia/Kolkata (IST)",
        status: p.status,
      })),
    },
  };
}
