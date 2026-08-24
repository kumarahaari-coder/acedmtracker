import {
  AppState,
  ContentItem,
  ContentPlatform,
  ContentType,
  Project,
  SubmissionAsset,
  SubmissionVersion,
  UserRole,
} from "./types";
import { getDerivedItemAnalytics } from "./derived";

// --- CLIENT DTOs (Data Minimization) ---

export interface ClientProjectDTO {
  id: string;
  name: string;
  clientBrand: string;
  avatar: string;
  scope: string;
  timezone: string;
  allowedMetricKeys: string[];
}

export interface ClientCreativeDTO {
  id: string;
  projectId: string;
  title: string;
  platform: ContentPlatform;
  contentType: ContentType;
  stage: string;
  contentGroupId?: string;
  groupTitle?: string;
  scheduledDate?: string;
  publishedAt?: string;
  liveUrl?: string;
  copy?: {
    caption: string;
    hashtags: string[];
    cta: string;
  };
  assets: SubmissionAsset[];
  permittedMetrics: Record<string, number>;
}

export interface ClientCalendarItemDTO {
  id: string;
  title: string;
  platform: ContentPlatform;
  contentType: ContentType;
  status: "scheduled" | "published";
  date: string; // ISO date or YYYY-MM-DD
  contentGroupId?: string;
  previewUrl?: string;
  liveUrl?: string;
}

export interface ClientAnalyticsResponse {
  allowedMetricKeys: string[];
  totals: Record<string, number>;
  platformBreakdown: Record<string, Record<string, number>>;
  topContent: Array<{
    id: string;
    title: string;
    platform: string;
    metrics: Record<string, number>;
  }>;
}

export interface ClientOverviewDTO {
  project: ClientProjectDTO;
  summary: {
    upcomingCount: number;
    approvedCount: number;
    scheduledCount: number;
    publishedCount: number;
    totalCreatives: number;
  };
  recentCreatives: ClientCreativeDTO[];
  upcomingCalendar: ClientCalendarItemDTO[];
  performanceSnapshot: Record<string, number>;
}

// Default metric whitelist (commercial/revenue excluded by default unless explicitly whitelisted)
export const DEFAULT_CLIENT_ALLOWED_METRICS = [
  "reach",
  "impressions",
  "engagementRate",
  "clicks",
  "leads",
];

// --- AUTHORIZATION & SECURITY HELPERS ---

export function validateClientProjectAccess(
  state: AppState,
  projectId: string,
  userId: string,
  role: UserRole
): { authorized: boolean; error?: string; project?: Project } {
  const project = state.projects.find((p) => p.id === projectId && p.status !== "archived");
  if (!project) {
    return { authorized: false, error: "Project not found or inaccessible." };
  }

  // Founder & Admin have preview access; for Client & Consultant, verify active ProjectMembership
  if (role === "client" || role === "consultant") {
    const user = state.users.find((u) => u.id === userId);
    if (!user || user.status === "inactive") {
      return { authorized: false, error: "Account inactive or unauthorized." };
    }

    const membership = state.projectMemberships.find(
      (m) => m.projectId === projectId && m.userId === userId && m.status === "active"
    );

    if (!membership) {
      return { authorized: false, error: "Access denied. No active project membership." };
    }
  } else if (role === "designer") {
    // Designers are restricted from Client Portal
    return { authorized: false, error: "Designers cannot access the Client Portal." };
  }

  return { authorized: true, project };
}

export function isContentEligibleForClient(
  item: ContentItem,
  version?: SubmissionVersion
): boolean {
  // 1. Must be explicitly marked clientVisible by agency management
  if (item.clientVisible !== true) return false;

  // 2. Must not be internal unsubmitted draft, idea, or rejected stage
  if (item.stage === "draft" || item.stage === "idea") return false;

  // 3. If version provided, it must not be a working draft
  if (version && version.isDraft) return false;

  return true;
}

export function filterMetricsByWhitelist(
  metrics: Record<string, number>,
  allowedKeys: string[]
): Record<string, number> {
  const allowedSet = new Set(allowedKeys);
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(metrics)) {
    if (allowedSet.has(key)) {
      result[key] = val;
    }
  }
  return result;
}

// --- AUTHORITATIVE CLIENT SELECTORS ---

export function getClientProjectOverview(
  state: AppState,
  projectId: string,
  userId: string,
  role: UserRole
): { status: 200 | 403 | 404; data?: ClientOverviewDTO; error?: string } {
  const auth = validateClientProjectAccess(state, projectId, userId, role);
  if (!auth.authorized || !auth.project) {
    return { status: 403, error: auth.error };
  }

  const project = auth.project;
  const allowedMetrics = project.clientAnalyticsConfig?.allowedMetricKeys || DEFAULT_CLIENT_ALLOWED_METRICS;

  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  const eligibleItems = projectItems.filter((i) => {
    const version = state.submissionVersions.find(
      (v) => v.id === i.latestSubmittedVersionId || v.id === i.activeDraftVersionId
    );
    return isContentEligibleForClient(i, version);
  });

  const publishedItems = eligibleItems.filter((i) => i.stage === "published" || !!i.publishedAt);
  const scheduledItems = eligibleItems.filter(
    (i) => i.stage === "scheduled" || (!i.publishedAt && !!i.deadlines.scheduledPublicationDate)
  );
  const approvedItems = eligibleItems.filter((i) => i.stage === "approved");
  const upcomingItems = eligibleItems.filter((i) => i.stage !== "published");

  // Format recent creatives
  const recentCreatives: ClientCreativeDTO[] = eligibleItems.slice(0, 6).map((item) => {
    const version = state.submissionVersions.find(
      (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
    );
    const rawMetrics = getDerivedItemAnalytics(item.id, state.analyticsSnapshots);
    const group = item.contentGroupId ? state.contentGroups.find((g) => g.id === item.contentGroupId) : null;

    return {
      id: item.id,
      projectId: item.projectId,
      title: item.title,
      platform: item.platform,
      contentType: item.contentType,
      stage: item.stage,
      contentGroupId: item.contentGroupId,
      groupTitle: group?.title,
      scheduledDate: item.deadlines.scheduledPublicationDate,
      publishedAt: item.publishedAt,
      liveUrl: item.liveUrl,
      copy: version?.copy
        ? {
            caption: version.copy.caption,
            hashtags: version.copy.hashtags || [],
            cta: version.copy.cta || "",
          }
        : undefined,
      assets: version?.creativeAssets || [],
      permittedMetrics: filterMetricsByWhitelist(rawMetrics, allowedMetrics),
    };
  });

  // Format upcoming calendar items
  const upcomingCalendar: ClientCalendarItemDTO[] = eligibleItems
    .filter((i) => i.deadlines.scheduledPublicationDate || i.publishedAt)
    .sort((a, b) => {
      const dateA = a.publishedAt || a.deadlines.scheduledPublicationDate || "";
      const dateB = b.publishedAt || b.deadlines.scheduledPublicationDate || "";
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .slice(0, 5)
    .map((item) => {
      const version = state.submissionVersions.find(
        (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
      );
      return {
        id: item.id,
        title: item.title,
        platform: item.platform,
        contentType: item.contentType,
        status: item.publishedAt ? "published" : "scheduled",
        date: item.publishedAt || item.deadlines.scheduledPublicationDate || "",
        contentGroupId: item.contentGroupId,
        previewUrl: version?.creativeAssets[0]?.previewUrl,
        liveUrl: item.liveUrl,
      };
    });

  // Calculate project aggregate metrics strictly conforming to whitelist
  const rawAggregateTotals: Record<string, number> = {
    reach: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    revenue: 0,
  };

  let engagementRateSum = 0;
  let publishedCount = 0;

  for (const item of publishedItems) {
    const m = getDerivedItemAnalytics(item.id, state.analyticsSnapshots);
    rawAggregateTotals.reach += m.reach || 0;
    rawAggregateTotals.impressions += m.impressions || 0;
    rawAggregateTotals.clicks += m.clicks || 0;
    rawAggregateTotals.leads += m.leads || 0;
    rawAggregateTotals.revenue += m.revenue || 0;
    if (m.engagementRate) {
      engagementRateSum += m.engagementRate;
      publishedCount++;
    }
  }

  rawAggregateTotals.engagementRate = publishedCount > 0 ? parseFloat((engagementRateSum / publishedCount).toFixed(2)) : 0;

  const performanceSnapshot = filterMetricsByWhitelist(rawAggregateTotals, allowedMetrics);

  return {
    status: 200,
    data: {
      project: {
        id: project.id,
        name: project.name,
        clientBrand: project.clientBrand,
        avatar: project.avatar,
        scope: project.scope,
        timezone: project.timezone,
        allowedMetricKeys: allowedMetrics,
      },
      summary: {
        upcomingCount: upcomingItems.length,
        approvedCount: approvedItems.length,
        scheduledCount: scheduledItems.length,
        publishedCount: publishedItems.length,
        totalCreatives: eligibleItems.length,
      },
      recentCreatives,
      upcomingCalendar,
      performanceSnapshot,
    },
  };
}

export function getClientCreativeLibrary(
  state: AppState,
  projectId: string,
  userId: string,
  role: UserRole,
  filters?: { platform?: string; contentType?: string; status?: string; search?: string }
): { status: 200 | 403 | 404; data?: ClientCreativeDTO[]; error?: string } {
  const auth = validateClientProjectAccess(state, projectId, userId, role);
  if (!auth.authorized || !auth.project) {
    return { status: 403, error: auth.error };
  }

  const allowedMetrics = auth.project.clientAnalyticsConfig?.allowedMetricKeys || DEFAULT_CLIENT_ALLOWED_METRICS;
  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);

  let eligible = projectItems.filter((item) => {
    const version = state.submissionVersions.find(
      (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
    );
    return isContentEligibleForClient(item, version);
  });

  if (filters?.platform && filters.platform !== "all") {
    eligible = eligible.filter((i) => i.platform === filters.platform);
  }
  if (filters?.contentType && filters.contentType !== "all") {
    eligible = eligible.filter((i) => i.contentType === filters.contentType);
  }
  if (filters?.status && filters.status !== "all") {
    eligible = eligible.filter((i) => {
      if (filters.status === "published") return !!i.publishedAt || i.stage === "published";
      if (filters.status === "scheduled") return !i.publishedAt && (i.stage === "scheduled" || !!i.deadlines.scheduledPublicationDate);
      if (filters.status === "approved") return i.stage === "approved";
      return true;
    });
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    eligible = eligible.filter((i) => i.title.toLowerCase().includes(q));
  }

  const dtos: ClientCreativeDTO[] = eligible.map((item) => {
    const version = state.submissionVersions.find(
      (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
    );
    const rawMetrics = getDerivedItemAnalytics(item.id, state.analyticsSnapshots);
    const group = item.contentGroupId ? state.contentGroups.find((g) => g.id === item.contentGroupId) : null;

    return {
      id: item.id,
      projectId: item.projectId,
      title: item.title,
      platform: item.platform,
      contentType: item.contentType,
      stage: item.stage,
      contentGroupId: item.contentGroupId,
      groupTitle: group?.title,
      scheduledDate: item.deadlines.scheduledPublicationDate,
      publishedAt: item.publishedAt,
      liveUrl: item.liveUrl,
      copy: version?.copy
        ? {
            caption: version.copy.caption,
            hashtags: version.copy.hashtags || [],
            cta: version.copy.cta || "",
          }
        : undefined,
      assets: version?.creativeAssets || [],
      permittedMetrics: filterMetricsByWhitelist(rawMetrics, allowedMetrics),
    };
  });

  return { status: 200, data: dtos };
}

export function getClientCalendar(
  state: AppState,
  projectId: string,
  userId: string,
  role: UserRole
): { status: 200 | 403 | 404; data?: ClientCalendarItemDTO[]; error?: string } {
  const auth = validateClientProjectAccess(state, projectId, userId, role);
  if (!auth.authorized || !auth.project) {
    return { status: 403, error: auth.error };
  }

  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  const eligible = projectItems.filter((i) => {
    const version = state.submissionVersions.find(
      (v) => v.id === i.latestSubmittedVersionId || v.id === i.activeDraftVersionId
    );
    return isContentEligibleForClient(i, version) && (i.publishedAt || i.deadlines.scheduledPublicationDate);
  });

  const dtos: ClientCalendarItemDTO[] = eligible.map((item) => {
    const version = state.submissionVersions.find(
      (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
    );
    return {
      id: item.id,
      title: item.title,
      platform: item.platform,
      contentType: item.contentType,
      status: item.publishedAt ? "published" : "scheduled",
      date: item.publishedAt || item.deadlines.scheduledPublicationDate || "",
      contentGroupId: item.contentGroupId,
      previewUrl: version?.creativeAssets[0]?.previewUrl,
      liveUrl: item.liveUrl,
    };
  });

  return { status: 200, data: dtos };
}

export function getClientAnalytics(
  state: AppState,
  projectId: string,
  userId: string,
  role: UserRole,
  filters?: { platform?: string; contentType?: string }
): { status: 200 | 403 | 404; data?: ClientAnalyticsResponse; error?: string } {
  const auth = validateClientProjectAccess(state, projectId, userId, role);
  if (!auth.authorized || !auth.project) {
    return { status: 403, error: auth.error };
  }

  const allowedMetrics = auth.project.clientAnalyticsConfig?.allowedMetricKeys || DEFAULT_CLIENT_ALLOWED_METRICS;
  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);

  let eligible = projectItems.filter((i) => {
    const version = state.submissionVersions.find(
      (v) => v.id === i.latestSubmittedVersionId || v.id === i.activeDraftVersionId
    );
    return isContentEligibleForClient(i, version) && (i.publishedAt || i.stage === "published");
  });

  if (filters?.platform && filters.platform !== "all") {
    eligible = eligible.filter((i) => i.platform === filters.platform);
  }
  if (filters?.contentType && filters.contentType !== "all") {
    eligible = eligible.filter((i) => i.contentType === filters.contentType);
  }

  const totals: Record<string, number> = {
    reach: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    revenue: 0,
  };

  const platformBreakdown: Record<string, Record<string, number>> = {};
  let rateSum = 0;
  let count = 0;

  const topContentList: Array<{ id: string; title: string; platform: string; metrics: Record<string, number> }> = [];

  for (const item of eligible) {
    const rawMetrics = getDerivedItemAnalytics(item.id, state.analyticsSnapshots);
    const filteredItemMetrics = filterMetricsByWhitelist(rawMetrics, allowedMetrics);

    totals.reach += rawMetrics.reach || 0;
    totals.impressions += rawMetrics.impressions || 0;
    totals.clicks += rawMetrics.clicks || 0;
    totals.leads += rawMetrics.leads || 0;
    totals.revenue += rawMetrics.revenue || 0;

    if (rawMetrics.engagementRate) {
      rateSum += rawMetrics.engagementRate;
      count++;
    }

    if (!platformBreakdown[item.platform]) {
      platformBreakdown[item.platform] = { reach: 0, impressions: 0, clicks: 0, leads: 0, revenue: 0 };
    }
    platformBreakdown[item.platform].reach += rawMetrics.reach || 0;
    platformBreakdown[item.platform].impressions += rawMetrics.impressions || 0;
    platformBreakdown[item.platform].clicks += rawMetrics.clicks || 0;
    platformBreakdown[item.platform].leads += rawMetrics.leads || 0;
    platformBreakdown[item.platform].revenue += rawMetrics.revenue || 0;

    topContentList.push({
      id: item.id,
      title: item.title,
      platform: item.platform,
      metrics: filteredItemMetrics,
    });
  }

  totals.engagementRate = count > 0 ? parseFloat((rateSum / count).toFixed(2)) : 0;

  // Filter totals and platform breakdowns strictly by whitelist
  const sanitizedTotals = filterMetricsByWhitelist(totals, allowedMetrics);
  const sanitizedPlatformBreakdown: Record<string, Record<string, number>> = {};

  for (const [p, metrics] of Object.entries(platformBreakdown)) {
    sanitizedPlatformBreakdown[p] = filterMetricsByWhitelist(metrics, allowedMetrics);
  }

  topContentList.sort((a, b) => (b.metrics.reach || b.metrics.impressions || 0) - (a.metrics.reach || a.metrics.impressions || 0));

  return {
    status: 200,
    data: {
      allowedMetricKeys: allowedMetrics,
      totals: sanitizedTotals,
      platformBreakdown: sanitizedPlatformBreakdown,
      topContent: topContentList.slice(0, 10),
    },
  };
}

export function getClientAssetAccess(
  state: AppState,
  projectId: string,
  assetId: string,
  userId: string,
  role: UserRole
): { status: 200 | 403 | 404; asset?: SubmissionAsset; error?: string } {
  const auth = validateClientProjectAccess(state, projectId, userId, role);
  if (!auth.authorized || !auth.project) {
    return { status: 403, error: auth.error };
  }

  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  for (const item of projectItems) {
    const version = state.submissionVersions.find(
      (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
    );
    if (!isContentEligibleForClient(item, version) || !version) continue;

    const asset = version.creativeAssets.find((a) => a.assetId === assetId);
    if (asset) {
      return { status: 200, asset };
    }
  }

  return { status: 404, error: "Asset not found or restricted." };
}
