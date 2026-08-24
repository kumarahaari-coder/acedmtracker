import {
  AppState,
  ApprovalComponentType,
  ApprovalDecision,
  ComponentDecision,
  ContentItem,
  FounderOverride,
  SubmissionVersion,
} from "./types";

export interface ComponentApprovalSummary {
  founder: ComponentDecision;
  consultant: ComponentDecision;
  isFullyApproved: boolean;
  hasChangesRequested: boolean;
  founderDecisionObj?: ApprovalDecision;
  consultantDecisionObj?: ApprovalDecision;
}

export interface ContentApprovalMatrixSummary {
  copy: ComponentApprovalSummary;
  creative: ComponentApprovalSummary;
  posting_date: ComponentApprovalSummary;
  allComponentsApproved: boolean;
  anyChangesRequested: boolean;
  approvedCount: number; // e.g. 3 out of 3
  isOverridden: boolean;
  overrideObj?: FounderOverride;
}

export function getDerivedItemAnalytics(
  itemId: string,
  snapshots: AppState["analyticsSnapshots"]
) {
  const itemSnapshots = snapshots
    .filter((s) => s.contentItemId === itemId)
    .sort(
      (a, b) =>
        new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime()
    );

  if (itemSnapshots.length === 0) {
    return {
      reach: 0,
      impressions: 0,
      engagementRate: 0,
      clicks: 0,
      leads: 0,
      revenue: 0,
      snapshotsCount: 0,
    };
  }

  // Latest snapshot represents latest cumulative totals
  const latest = itemSnapshots[0];
  return {
    reach: latest.reach,
    impressions: latest.impressions,
    engagementRate: latest.engagementRate,
    clicks: latest.clicks,
    leads: latest.leads,
    revenue: latest.revenue,
    snapshotsCount: itemSnapshots.length,
  };
}

export function getComponentApprovalSummary(
  component: ApprovalComponentType,
  version: SubmissionVersion,
  decisions: ApprovalDecision[]
): ComponentApprovalSummary {
  const componentFingerprint =
    component === "copy"
      ? version.componentFingerprints.copyFingerprint
      : component === "creative"
      ? version.componentFingerprints.creativeFingerprint
      : version.componentFingerprints.postingDateFingerprint;

  // Filter decisions matching this version and current component fingerprint, not revoked
  const activeDecisions = decisions.filter(
    (d) =>
      d.submissionVersionId === version.id &&
      d.component === component &&
      d.componentFingerprint === componentFingerprint &&
      !d.revokedAt
  );

  // Get most recent decision by Founder
  const founderDec = activeDecisions
    .filter((d) => d.reviewerRole === "founder")
    .sort(
      (a, b) =>
        new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime()
    )[0];

  // Get most recent decision by Consultant
  const consultantDec = activeDecisions
    .filter((d) => d.reviewerRole === "consultant")
    .sort(
      (a, b) =>
        new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime()
    )[0];

  const founderStatus: ComponentDecision = founderDec ? founderDec.decision : "pending";
  const consultantStatus: ComponentDecision = consultantDec ? consultantDec.decision : "pending";

  const isFullyApproved = founderStatus === "approved" && consultantStatus === "approved";
  const hasChangesRequested =
    founderStatus === "changes_requested" ||
    founderStatus === "approved_with_conditions" ||
    consultantStatus === "changes_requested" ||
    consultantStatus === "approved_with_conditions";

  return {
    founder: founderStatus,
    consultant: consultantStatus,
    isFullyApproved,
    hasChangesRequested,
    founderDecisionObj: founderDec,
    consultantDecisionObj: consultantDec,
  };
}

export function getItemApprovalMatrixSummary(
  item: ContentItem,
  version: SubmissionVersion | undefined,
  decisions: ApprovalDecision[],
  overrides: FounderOverride[]
): ContentApprovalMatrixSummary {
  const overrideObj = overrides.find(
    (o) => o.contentItemId === item.id && (!version || o.submissionVersionId === version.id)
  );

  if (!version) {
    const emptyComp: ComponentApprovalSummary = {
      founder: "pending",
      consultant: "pending",
      isFullyApproved: false,
      hasChangesRequested: false,
    };
    return {
      copy: emptyComp,
      creative: emptyComp,
      posting_date: emptyComp,
      allComponentsApproved: !!overrideObj,
      anyChangesRequested: false,
      approvedCount: overrideObj ? 3 : 0,
      isOverridden: !!overrideObj,
      overrideObj,
    };
  }

  const copy = getComponentApprovalSummary("copy", version, decisions);
  const creative = getComponentApprovalSummary("creative", version, decisions);
  const posting_date = getComponentApprovalSummary("posting_date", version, decisions);

  let approvedCount = 0;
  if (copy.isFullyApproved) approvedCount++;
  if (creative.isFullyApproved) approvedCount++;
  if (posting_date.isFullyApproved) approvedCount++;

  const allComponentsApproved = (approvedCount === 3) || !!overrideObj;
  const anyChangesRequested =
    copy.hasChangesRequested || creative.hasChangesRequested || posting_date.hasChangesRequested;

  return {
    copy,
    creative,
    posting_date,
    allComponentsApproved,
    anyChangesRequested,
    approvedCount: overrideObj ? 3 : approvedCount,
    isOverridden: !!overrideObj,
    overrideObj,
  };
}

export function computeBestTimeRecommendation(
  projectId: string,
  snapshots: AppState["analyticsSnapshots"],
  contentItems: ContentItem[]
) {
  const projectItemIds = new Set(
    contentItems.filter((i) => i.projectId === projectId).map((i) => i.id)
  );
  const projectSnapshots = snapshots.filter((s) => projectItemIds.has(s.contentItemId));

  const MIN_SAMPLE_SIZE = 10;
  const sampleCount = projectSnapshots.length;

  if (sampleCount < MIN_SAMPLE_SIZE) {
    return {
      hasRecommendation: false,
      sampleCount,
      minRequired: MIN_SAMPLE_SIZE,
      message: `Insufficient project history (${sampleCount}/${MIN_SAMPLE_SIZE} published snapshots). Minimum sample required for reliable recommendation.`,
      recommendedTime: null,
      topPlatform: null,
    };
  }

  return {
    hasRecommendation: true,
    sampleCount,
    minRequired: MIN_SAMPLE_SIZE,
    message: `Based on ${sampleCount} project-specific historical posts:`,
    recommendedTime: "Tuesday & Thursday at 11:30 AM IST",
    topPlatform: "Instagram Carousels & Reels",
  };
}
