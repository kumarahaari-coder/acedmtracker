# Implementation Plan: Ace Assured Marketing Operations Consolidated Feature Update (Revised)

## Executive Summary & Architectural Corrections
This revised implementation plan establishes the production architecture for the Consolidated Feature Update to the standalone Ace Assured Marketing Operations application. It incorporates all 19 review directives, ensuring strict separation of concerns, robust server-side authorization, mathematical KPI accuracy, append-only audit ledgers, browser-independent timer semantics, and multi-tenant isolation.

---

## 1. Authoritative Domain Data Model

### 1.1 Separation of User, Role, Project Membership & Work Assignment
The data model strictly decouples four distinct concepts:
1. **User**: The physical person / identity record.
2. **Role**: The platform capability envelope assigned to a user (`admin`, `founder`, `consultant`, `designer`, `client`).
3. **Project Membership**: Normalized mapping granting a user access to a specific project.
4. **Content Assignment**: The atomic work ownership record linking a designer to a content item with deadlines, lifecycle statuses, and work sessions.

```typescript
// lib/types.ts

// 1. Authenticated User Roles (Guest Reviewer is NOT a user role)
export type UserRole = 
  | 'admin' 
  | 'founder' 
  | 'consultant' 
  | 'designer'  // Includes Video Editors
  | 'client';   // Authenticated client with scoped project access

// 2. User Identity Record (NO project arrays stored on User)
export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  jobTitle?: string;                     // e.g. "Lead Motion Graphic Designer"
  status: 'active' | 'inactive';         // Soft-inactivation strictly preserves history
  workingHoursPerDay?: number;           // Capacity reference (e.g. 8)
  dateJoined: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

// 3. Project Membership (Authoritative source of project visibility)
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

// 4. Content Assignment (Authoritative source of work ownership & deadlines)
export interface ContentAssignment {
  id: string;
  projectId: string;
  contentItemId: string;
  assigneeUserId: string;
  assignmentRole: 'designer' | 'video_editor' | 'collaborator';
  status: 'assigned' | 'accepted' | 'in_progress' | 'submitted' | 'reassigned' | 'completed';
  assignedByUserId: string;
  assignedAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  dueAt: string;                         // Authoritative submission deadline for this assignment
  reassignmentReason?: string;
  replacedAssignmentId?: string;         // Preserves chain of reassignments
  createdAt: string;
  updatedAt: string;
}
```

---

### 1.2 Time Tracking: Server-Timestamp Semantics & Append-Only Adjustments

#### Timer State & Pause/Resume Semantics
A work session is tracked using server timestamps without relying on local browser clocks:
- **`accumulatedSeconds`**: Total frozen duration from previous active segments.
- **`activeSegmentStartedAt`**: Server timestamp (ISO string) when current segment started; `null` when paused/stopped.
- **`status`**: `'active' | 'paused' | 'completed'`.

$$\text{Total Elapsed Time} = \text{accumulatedSeconds} + \begin{cases} (\text{serverNow} - \text{activeSegmentStartedAt}) & \text{if } \text{status} = \text{'active'} \\ 0 & \text{if } \text{status} \in \{\text{'paused'}, \text{'completed'}\} \end{cases}$$

#### State Transitions:
1. **Start**: `accumulatedSeconds = 0`, `activeSegmentStartedAt = serverNow`, `status = 'active'`, `startedAt = serverNow`.
2. **Pause**: `accumulatedSeconds += (serverNow - activeSegmentStartedAt)`, `activeSegmentStartedAt = null`, `status = 'paused'`.
3. **Resume**: `activeSegmentStartedAt = serverNow`, `status = 'active'`.
4. **Stop / Complete**: `accumulatedSeconds += (serverNow - activeSegmentStartedAt)`, `activeSegmentStartedAt = null`, `status = 'completed'`, `endedAt = serverNow`.

#### Append-Only Adjustment Ledger
Manual corrections never overwrite previous adjustments. Every adjustment is recorded in an immutable ledger:

```typescript
export interface WorkSessionAdjustment {
  id: string;
  workSessionId: string;
  previousDurationSeconds: number;
  adjustedDurationSeconds: number;
  reason: string;                         // Mandatory adjustment rationale
  adjustedByUserId: string;
  adjustedAt: string;
}

export interface WorkSession {
  id: string;
  projectId: string;
  contentItemId: string;
  assignmentId?: string;
  userId: string;
  startedAt: string;                      // Initial start timestamp
  endedAt?: string;                       // Final stop timestamp
  accumulatedSeconds: number;             // Base accumulated active seconds
  activeSegmentStartedAt?: string | null; // Null when paused/stopped
  status: 'active' | 'paused' | 'completed';
  adjustments: WorkSessionAdjustment[];   // Append-only audit history of corrections
  createdAt: string;
  updatedAt: string;
}
```

---

### 1.3 Content Items, Content Groups & Canonical Publication Dates

#### ContentGroup vs ContentItem Ownership Rules
- **`ContentGroup`**: Coordination entity for batch multi-platform campaigns (e.g. 1 creative released on Instagram, Facebook, and LinkedIn).
- **`ContentItem`**: **Authoritative** entity for platform-specific deliverable state (copy, assets, CTA, posting date, component approvals, publication state, and analytics).
- **"Apply to All Linked Platforms"**: A convenient client/API operation that explicitly pushes changes to sibling `ContentItem` records transactionally. No ambiguous split reads.

#### Single Canonical Publication Field
- Canonical live timestamp: **`publishedAt?: string`** (and **`liveUrl?: string`**, **`publishedByUserId?: string`**).
- `deadlines.scheduledPublicationDate` remains preserved for historical schedule vs actual delivery comparisons.

```typescript
export interface ContentGroup {
  id: string;
  projectId: string;
  name: string;
  concept: string;
  contentType: ContentType;
  targetPlatforms: ContentPlatform[];
  createdContentItemIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentItem {
  id: string;
  projectId: string;
  campaignId?: string;
  contentGroupId?: string;               // Optional link to parent ContentGroup
  title: string;
  platform: ContentPlatform;
  contentType: ContentType;
  stage: ContentStage;
  clientVisible: boolean;                // Explicit gate for Client Portal Library
  collaboratorIds: string[];
  deadlines: ContentDeadlines;           // Retains submissionDeadline, scheduledPublicationDate
  publishedAt?: string;                  // Canonical actual live date
  liveUrl?: string;                      // Canonical live post URL
  publishedByUserId?: string;            // User who verified publication
  currentVersionNumber: number;
  activeDraftVersionId?: string;
  latestSubmittedVersionId?: string;
  // READ-ONLY DERIVED CACHE (Computed transactionally from WorkSessions/Assignments):
  cachedCurrentAssigneeId?: string;      // Derived from latest active ContentAssignment
  cachedTotalTrackedSeconds?: number;    // Derived from sum of WorkSessions + Adjustments
}
```

---

### 1.4 Extensible Client Analytics Whitelist & Creative Visibility

```typescript
export interface ClientAnalyticsConfig {
  allowedMetricKeys: string[];           // Extensible whitelist, e.g. ['reach', 'impressions', 'engagementRate', 'clicks', 'leads']
  allowCreativeDownload: boolean;        // Whether client can download original assets
}

export interface Project {
  id: string;
  name: string;
  clientBrand: string;
  avatar: string;
  scope: string;
  timezone: string;
  status: 'active' | 'archived' | 'retention';
  targetRequirements: TargetRequirements;
  workflowStages: string[];
  clientAnalyticsConfig?: ClientAnalyticsConfig;
  createdAt: string;
  archivedAt?: string;
  retentionExpiresAt?: string;
}
```

#### Client Portal Visibility Rules:
A deliverable is visible in the Client Portal Creative Library if and only if:
1. `client.hasActiveMembership(item.projectId)`
2. `item.stage in ['approved', 'scheduled', 'published']`
3. `item.clientVisible === true`

**Excluded from Client Portal**:
- Internal draft versions (`isDraft: true`).
- Unsubmitted intermediate revisions.
- Change requests and designer response discussions.
- Internal comments (`visibility === 'internal'`).
- Designer work sessions and timers.
- Internal administrative audit trail.
- Non-whitelisted commercial analytics (Revenue, internal ROAS, production cost).

---

## 2. Mathematically Rigorous Designer KPI & Workload Definitions

The performance dashboard reports on actual operational events rather than raw version counts or browser counters:

### 2.1 Initial Delivery On-Time %
$$\text{Initial Delivery On-Time \%} = \frac{\text{Count of completed assignments where } v_1.\text{submittedAt} \le \text{assignment}.\text{dueAt}}{\text{Count of completed assignments with a defined dueAt}} \times 100$$
- *Rule*: Only evaluates the initial review submission ($v_1$) of each unique assignment against its initial due date.

### 2.2 Component-Aware First-Pass Approval %
$$\text{First-Pass Approval \%} = \frac{\text{Count of completed items where } v_1 \text{ achieved 100\% required approvals with zero changes requested}}{\text{Total completed content items submitted for review}} \times 100$$
- *Rule*: Evaluates project approver requirements across all 3 independent components (`copy`, `creative`, `posting_date`). If Founder or Consultant requested changes or rejected any component on $v_1$, it is NOT first-pass approved.

### 2.3 Average Revision Rounds
$$\text{Average Revision Rounds} = \frac{\text{Total qualifying resubmissions following a 'changes\_requested' decision}}{\text{Total completed reviewed content items}}$$
- *Rule*: Excludes draft autosaves or unsubmitted versions. Only counts resubmissions addressing formal change requests.

### 2.4 Average Production Time
$$\text{Average Production Time} = \frac{\sum (\text{Valid completed WorkSession durations} + \text{Adjustments}) \text{ for item}}{\text{Total completed creatives}}$$

### 2.5 Workload & Capacity Metrics (Objective Workload Dimensions)
- **Active Assignments Count**: Number of assignments in `['assigned', 'accepted', 'in_progress']`.
- **Due Today Count**: Active assignments with `dueAt` falling within the current calendar day.
- **Due This Week Count**: Active assignments with `dueAt` falling within the next 7 days.
- **Overdue Count**: Active assignments with `dueAt < now` and status not in `['submitted', 'completed']`.
- **Active Work Indicator**: Whether a designer currently has an active work session (`status === 'active'`).

---

## 3. Server Architecture vs Client State Responsibilities

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Next.js Frontend                              │
│  - React UI Components (Apple Light Design System)                     │
│  - Optimistic UI Updates & Navigation                                  │
│  - React Context (Query cache & ephemeral view state)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (Session Cookie / Bearer)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Node.js Serverless API Route Layer                  │
│  - Auth & Capability Guard (canManageTeam, canViewAudit, etc.)         │
│  - Server-Timestamp Authority (Timer now(), publish now())             │
│  - Analytics Whitelist Filtering (Project config metric redaction)     │
│  - Client Scoped Isolation (Validates ProjectMembership)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Connection Pool (SET LOCAL app.user_id)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    PostgreSQL (Neon AWS Singapore)                     │
│  - Normalized Tables (users, project_memberships, content_assignments) │
│  - Append-Only Ledgers (audit_records, work_session_adjustments)       │
│  - Row-Level Security (RLS) Policies on app_user role                  │
│  - SECURITY DEFINER Non-Recursive Membership Helper                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Capability-Based Role & Permission Matrix

| Capability / Resource | Founder | Consultant | Admin | Designer / Editor | Client | External Reviewer (Guest) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Manage Team Members & Roles** | Yes | No (View Only) | Yes | No | No | No |
| **Inactivate / Reactivate Users** | Yes | No | Yes | No | No | No |
| **Project Access** | Organization-wide | Assigned via Membership | Organization-wide | Assigned via Membership | Own Assigned Project Only | Scoped Review Token Only |
| **Content Calendar** | Full Project | Full Project | Full Project | Assigned Deliverables | Own Live & Confirmed Scheduled | No |
| **Create / Upload Deliverables** | Yes | Yes | Yes | Assigned Items | No | No |
| **Time Tracking / Check-in Timer** | View All | View All | View & Adjust | Track Own Assigned Work | No | No |
| **Internal Comments & Annotations** | Yes | Yes | Yes | Yes | No | Scoped Guest Comments Only |
| **3-Component Approvals** | Yes | Yes | Override Only | No | No | No |
| **Client Creative Library** | Full | Full | Full | Assigned | Own Approved/Live Creatives | Scoped Submission Asset Only |
| **Analytics Access** | Full Metrics | Full Metrics | Full Metrics | Operational Summary | Whitelisted Metrics Only | No |
| **Designer Performance Scorecard** | Full Organization | Full Organization | Full Organization | Personal Workload Widget Only | No | No |
| **Audit History** | Full Ledger | Full Ledger | Full Ledger | No (403 Forbidden) | No (403 Forbidden) | No (403 Forbidden) |

---

## 5. UI Routes & Navigation Structure

### 5.1 Internal Dashboard Routes
1. **`/` (Cross-Project My Work)**:
   - Designer: Active check-in timer toolbar, assigned tasks due today/this week, change requests requiring response.
   - Founder/Consultant: Cross-project approval queues, overdue escalations.
2. **`/performance` (Organization-Level Designer Performance)**:
   - Team KPI cards, Designer Comparison Scorecard, Individual 4-Quadrant drilldown (Productivity, Delivery, Review Efficiency, Output), and live Capacity/Workload matrix.
3. **`/projects/[projectId]/performance` (Project-Level Designer Performance)**:
   - Project-filtered performance metrics and workload.
4. **`/projects/[projectId]/calendar` (Content Calendar)**:
   - Unified multi-platform create modal.
   - Historical published items positioned on canonical `publishedAt`; future items on `scheduledPublicationDate`.
5. **`/projects/[projectId]/content/[itemId]` (Deliverable Workspace)**:
   - Persistent check-in timer toolbar (Start, Pause, Resume, Stop) with live server timestamp synchronization.
   - Assigned designer badge with reassign dropdown for Founders/Consultants/Admins.
   - Linked platform switcher for items in a `ContentGroup`.
6. **`/projects/[projectId]/audit` (Audit History)**:
   - Full immutable security audit log.
   - Protected: Returns 403 Forbidden state for Designers and Clients.
7. **`/projects/[projectId]/settings` & `/settings/team` (Team & Project Settings)**:
   - Full member directory with role assignment, designation, date joined, active/inactive status toggle, and Client Analytics Whitelist configuration.

### 5.2 Authenticated Client Portal Routes
1. **`/portal/[projectId]` (Client Project Overview)**:
   - High-level progress towards quarterly targets and upcoming deliveries.
2. **`/portal/[projectId]/calendar` (Client Content Calendar)**:
   - Published live items and confirmed scheduled release dates.
3. **`/portal/[projectId]/creatives` (Client Creative Library)**:
   - Clean visual grid of approved/published creatives with platform badges, live post links, and optional download buttons.
4. **`/portal/[projectId]/analytics` (Client Analytics Hub)**:
   - Whitelisted metric charts and KPIs (Reach, Impressions, Engagement, Leads; Revenue and production hours strictly hidden).

---

## 6. Security Test Plan (13 Mandatory Automated Suites)

```typescript
// tests/security/
1.  client-isolation.test.ts:
    - Verifies Client A querying Client B's projectId receives 404/403 with zero information leakage.
    - Verifies Client directly requesting another project's creative file/URL is denied.
2.  analytics-whitelist.test.ts:
    - Verifies Client API payload strictly redacts non-whitelisted metrics (e.g. revenue, internal cost) even if requested.
3.  audit-history-gate.test.ts:
    - Verifies Designers and Clients requesting Audit History endpoint receive 403 Forbidden.
4.  designer-performance-gate.test.ts:
    - Verifies Designer requesting /performance or management scorecard API receives 403 Forbidden.
    - Verifies Designer cannot query another designer's tracked time sessions.
5.  timer-lifecycle-semantics.test.ts:
    - Verifies multiple start -> pause -> resume -> pause -> resume -> stop cycles compute exact accumulated duration using server timestamps.
    - Verifies attempting to start multiple concurrent active timers on different items is safely handled.
6.  work-session-adjustments.test.ts:
    - Verifies append-only adjustment ledger preserves multiple consecutive corrections with actor ID and mandatory reason.
7.  team-member-inactivation.test.ts:
    - Verifies inactive team member login is blocked while all past assignments, work sessions, submissions, and audit records remain intact.
8.  project-membership-enforcement.test.ts:
    - Verifies removed project member cannot access previously accessible project routes.
9.  multi-platform-group-isolation.test.ts:
    - Verifies "Apply to all linked platforms" propagates changes to siblings while preserving platform-specific unselected fields.
10. kpi-component-approvals.test.ts:
    - Verifies First-Pass Approval calculation correctly fails if changes are requested on only 1 out of 3 components (Copy, Creative, Posting Date).
11. on-time-delivery-math.test.ts:
    - Verifies On-Time Delivery % evaluates only initial review submissions (v1) against assignment dueAt.
12. client-creative-visibility.test.ts:
    - Verifies internal draft versions, rejected creatives, and internal comments are 100% stripped from Client Creative Library.
13. regression-full-suite.test.ts:
    - Verifies all 20 existing Phase A test suites pass without regression.
```

---

## 7. Migration & Rollout Plan
1. **Schema Envelope Migration**: Update deterministic state envelope migration (`lib/migrations.ts` v2 -> v3) adding `contentAssignments`, `workSessions`, and `contentGroups` with zero data loss.
2. **PostgreSQL Phase B DDL Update**: Add table definitions for `content_groups`, `content_assignments`, `work_sessions`, and `work_session_adjustments` with composite foreign keys and tenant RLS policies in `docs/phase-b-architecture.md`.
3. **Incremental Implementation**:
   - **Phase 1**: Team Member Model & Soft-Inactivation.
   - **Phase 2**: Content Assignment Workflow & Server-Timestamped Time Tracking.
   - **Phase 3**: Multi-Platform Content Groups & Canonical Live Published Dates.
   - **Phase 4**: Audit History Security & 403 Gates.
   - **Phase 5**: Authenticated Client Portal & Whitelisted Analytics.
   - **Phase 6**: Cross-Project Designer Performance Dashboard & Workload Capacity View.
4. **Verification**: Execute `npx tsc --noEmit && npx vitest run && npm run build` after each phase.
