export type UserRole = 'admin' | 'founder' | 'consultant' | 'designer' | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  jobTitle?: string;
  status: 'active' | 'inactive';
  workingHoursPerDay?: number;
  dateJoined: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMembership {
  id: string;
  projectId: string;
  userId: string;
  status: 'active' | 'inactive';
  membershipRole?: UserRole;
  addedByUserId: string;
  addedAt: string;
  removedAt?: string;
}

export interface TargetRequirements {
  posts: number;
  carousels: number;
  reels: number;
  trialReels: number;
}

export type ProjectEngagementModel = 'deliverable_based' | 'objective_based';

export interface ProjectObjectiveConfig {
  objectiveName: string;
  metricName: string; // e.g. "Qualified Leads", "Attributed Revenue (INR)", "Registrations"
  targetValue: number;
  currentValue: number;
  startDate?: string;
  targetDate?: string;
  unit?: string;
  notes?: string;
}

export interface Project {
  id: string;
  name: string;
  clientBrand: string;
  avatar: string;
  scope: string;
  timezone: string; // e.g. 'Asia/Kolkata' (IST)
  status: 'active' | 'archived' | 'retention';
  engagementModel?: ProjectEngagementModel; // 'deliverable_based' (default) or 'objective_based'
  objectiveConfig?: ProjectObjectiveConfig;
  targetRequirements: TargetRequirements;
  workflowStages: string[];
  clientAnalyticsConfig?: {
    allowedMetricKeys: string[]; // e.g. ['reach', 'impressions', 'engagementRate', 'clicks', 'leads']
  };
  createdAt: string;
  archivedAt?: string;
  retentionExpiresAt?: string;
}

export interface Campaign {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  description: string;
  status: 'planning' | 'active' | 'completed' | 'paused';
  startDate: string;
  endDate: string;
  ownerId: string;
}

export interface ContentFamily {
  id: string;
  projectId: string;
  campaignId?: string;
  name: string;
  concept: string;
}

export type ContentPlatform = 'Instagram' | 'Facebook' | 'LinkedIn' | 'YouTube' | 'X' | 'Email';
export type ContentType = 'post' | 'carousel' | 'reel' | 'trial_reel';
export type ContentStage = 
  | 'idea' 
  | 'draft' 
  | 'submitted' 
  | 'in_review' 
  | 'changes_requested' 
  | 'approved' 
  | 'scheduled' 
  | 'published' 
  | 'insights_pending' 
  | 'reported';

export interface ContentDeadlines {
  submissionDeadline?: string;
  resubmissionDeadline?: string;
  approvalTarget?: string;
  scheduledPublicationDate?: string;
  actualPublicationTime?: string;
}

export interface ContentGroup {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  conceptNotes?: string;
  contentItemIds: string[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export type ScopeClassification = 'contracted' | 'goodwill' | 'additional_billable';

export interface ContentItem {
  id: string;
  projectId: string;
  campaignId?: string;
  contentFamilyId?: string;
  contentGroupId?: string;
  title: string;
  platform: ContentPlatform;
  contentType: ContentType;
  stage: ContentStage;
  accountableOwnerId: string;
  collaboratorIds: string[];
  deadlines: ContentDeadlines;
  currentVersionNumber: number; // 1, 2, 3...
  activeDraftVersionId?: string;
  latestSubmittedVersionId?: string;
  publishedAt?: string; // Canonical ISO publication timestamp
  liveUrl?: string; // Canonical external live URL
  publishedByUserId?: string;
  clientVisible?: boolean; // True when authorized for Client Portal rendering
  scopeClassification?: ScopeClassification; // 'contracted' (default), 'goodwill', or 'additional_billable'
  // Note: Derived commercial metrics are computed from AnalyticsSnapshot[]
}

export interface SubmissionAsset {
  assetId: string;
  filename: string;
  previewUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  contentHash: string;
  isDriveLink?: boolean;
  driveUrl?: string;
}

export interface SubmissionVersion {
  id: string;
  contentItemId: string;
  versionNumber: number;
  isDraft: boolean; // True while designer edits; frozen upon submission
  createdAt: string;
  submittedAt?: string;
  copy: {
    caption: string;
    hashtags: string[];
    cta: string;
    destinationUrl?: string;
  };
  creativeAssets: SubmissionAsset[];
  scheduledDate?: string;
  componentFingerprints: {
    copyFingerprint: string;
    creativeFingerprint: string;
    postingDateFingerprint: string;
  };
}

export type ApprovalComponentType = 'copy' | 'creative' | 'posting_date';
export type ComponentDecision = 'pending' | 'approved' | 'changes_requested' | 'approved_with_conditions';

export interface ApprovalDecision {
  id: string;
  projectId: string;
  contentItemId: string;
  submissionVersionId: string;
  component: ApprovalComponentType;
  componentFingerprint: string;
  reviewerUserId: string;
  reviewerRole: 'founder' | 'consultant';
  decision: ComponentDecision;
  note?: string;
  decidedAt: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface FounderOverride {
  id: string;
  projectId: string;
  contentItemId: string;
  submissionVersionId: string;
  component?: ApprovalComponentType;
  reason: string;
  actorUserId: string;
  createdAt: string;
}

export type ChangeRequestPriority = 'low' | 'medium' | 'high' | 'blocker';
export type ChangeRequestStatus = 'open' | 'addressed' | 'resolved' | 'disputed' | 'waived';

export interface ChangeRequest {
  id: string;
  projectId: string;
  contentItemId: string;
  submissionVersionId: string;
  component: ApprovalComponentType;
  reviewerUserId: string;
  reviewerName: string;
  requestedChange: string;
  priority: ChangeRequestPriority;
  status: ChangeRequestStatus;
  designerResponse?: {
    text: string;
    evidenceAssetId?: string;
    addressedInVersionId: string;
    respondedAt: string;
  };
  createdAt: string;
}

export interface Comment {
  id: string;
  projectId: string;
  contentItemId: string;
  submissionVersionId?: string;
  parentCommentId?: string;
  authorUserId?: string;
  externalReviewerName?: string;
  visibility: 'internal' | 'external';
  body: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedByUserId?: string;
}

export interface Annotation {
  id: string;
  projectId: string;
  commentId: string;
  assetId: string;
  type: 'point' | 'region' | 'video_timestamp' | 'pdf_page';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  timestampSeconds?: number;
  pageNumber?: number;
}

export type DeadlineKind =
  | 'submission'
  | 'resubmission'
  | 'approval_target'
  | 'scheduled_publication'
  | 'actual_publication';

export interface DeadlineRecord {
  id: string;
  projectId: string;
  contentItemId: string;
  kind: DeadlineKind;
  dueAt: string;
  completedAt?: string;
  supersededAt?: string;
  supersededByDeadlineId?: string;
  changedByUserId: string;
  changeReason?: string;
  createdAt: string;
}

export interface PublicationRecord {
  id: string;
  projectId: string;
  contentItemId: string;
  submissionVersionId: string;
  liveUrl: string;
  publishedAt: string;
  markedPublishedByUserId: string;
  externalEditOccurred: boolean;
  externalEditNote?: string;
  externalEditedAt?: string;
  externalEditRecordedByUserId?: string;
}

export interface ExternalReviewLink {
  id: string;
  projectId: string;
  contentItemId: string;
  submissionVersionId: string;
  demoToken: string; // Synthetic simulation token
  expiresAt: string;
  revokedAt?: string;
  allowDownload: boolean;
  createdByUserId: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  projectId: string;
  recipientUserId: string;
  eventType: 
    | 'deadline_reminder_4h' 
    | 'overdue_escalation_4h' 
    | 'assignment' 
    | 'submission' 
    | 'resubmission' 
    | 'changes_requested' 
    | 'approval_granted' 
    | 'founder_override' 
    | 'mention';
  entityType: 'content_item' | 'project' | 'asset' | 'script';
  entityId: string;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
}

export interface ImportBatch {
  id: string;
  projectId: string;
  filename: string;
  status: 'validating' | 'committed' | 'failed';
  mapping: Record<string, string>;
  validRowCount: number;
  invalidRowCount: number;
  duplicateRowCount: number;
  createdAt: string;
}

export interface ScriptScene {
  sceneNumber: number;
  visual: string;
  audio: string;
  onScreenText?: string;
  durationSeconds?: number;
}

export interface Script {
  id: string;
  projectId: string;
  title: string;
  campaignId?: string;
  platform: ContentPlatform;
  status: 'backlog' | 'in_progress' | 'ready' | 'linked';
  hook: string;
  scenes: ScriptScene[];
  cta: string;
  notes: string;
  musicTrack?: string;
  musicUrl?: string;
  linkedContentItemId?: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  fileSizeBytes: number;
  mimeType: string;
  isDriveLink: boolean;
  driveUrl?: string;
  previewUrl: string;
  uploadedByUserId: string;
  createdAt: string;
  tags: string[];
}

export interface AnalyticsSnapshot {
  id: string;
  projectId: string;
  contentItemId: string;
  snapshotDate: string;
  platform: ContentPlatform;
  reach: number;
  impressions: number;
  engagementRate: number;
  clicks: number;
  leads: number; // Synthetic
  revenue: number; // Synthetic
  importBatchId?: string;
}

export interface AuditRecord {
  id: string;
  projectId: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  summary: string;
  reason?: string;
  before?: any;
  after?: any;
}

export type AssignmentRole = 'designer' | 'video_editor' | 'collaborator';
export type AssignmentStatus = 'assigned' | 'accepted' | 'in_progress' | 'submitted' | 'reassigned' | 'completed';

export interface AssignmentDueHistory {
  previousDueAt: string;
  newDueAt: string;
  changedByUserId: string;
  changedAt: string;
  reason: string;
}

export interface ContentAssignment {
  id: string;
  projectId: string;
  contentItemId: string;
  assigneeUserId: string;
  assignmentRole: AssignmentRole;
  status: AssignmentStatus;
  assignedByUserId: string;
  assignedAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  initialDueAt: string;
  currentDueAt: string;
  dueAtHistory?: AssignmentDueHistory[];
  firstSubmittedAt?: string;
  reassignmentReason?: string;
  replacedAssignmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkSessionAdjustment {
  id: string;
  workSessionId: string;
  previousDurationSeconds: number;
  adjustedDurationSeconds: number;
  reason: string;
  adjustedByUserId: string;
  adjustedAt: string;
}

export interface WorkSession {
  id: string;
  projectId: string;
  contentItemId: string;
  assignmentId: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  accumulatedSeconds: number;
  activeSegmentStartedAt?: string | null;
  status: 'active' | 'paused' | 'completed';
  adjustments: WorkSessionAdjustment[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceCorrection {
  id: string;
  previousCheckIn?: string;
  newCheckIn?: string;
  previousCheckOut?: string;
  newCheckOut?: string;
  changedByUserId: string;
  reason: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  attendanceDate: string; // 'YYYY-MM-DD' formatted in Asia/Kolkata timezone
  checkedInAt: string;    // ISO timestamp
  checkedOutAt?: string;   // ISO timestamp
  status: 'checked_in' | 'checked_out';
  corrections?: AttendanceCorrection[];
  createdAt: string;
  updatedAt: string;
}

export interface StorageEnvelope<T> {
  schemaVersion: number;
  seededAt: string;
  updatedAt: string;
  data: T;
}

export interface AppState {
  users: User[];
  projectMemberships: ProjectMembership[];
  projects: Project[];
  campaigns: Campaign[];
  contentFamilies: ContentFamily[];
  contentGroups: ContentGroup[];
  contentItems: ContentItem[];
  contentAssignments: ContentAssignment[];
  attendanceRecords: AttendanceRecord[];
  workSessions: WorkSession[];
  submissionVersions: SubmissionVersion[];
  approvalDecisions: ApprovalDecision[];
  founderOverrides: FounderOverride[];
  changeRequests: ChangeRequest[];
  comments: Comment[];
  annotations: Annotation[];
  deadlineRecords: DeadlineRecord[];
  publicationRecords: PublicationRecord[];
  externalReviewLinks: ExternalReviewLink[];
  notifications: Notification[];
  importBatches: ImportBatch[];
  scripts: Script[];
  assets: Asset[];
  analyticsSnapshots: AnalyticsSnapshot[];
  auditRecords: AuditRecord[];
}
