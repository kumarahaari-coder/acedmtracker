# AceCore — Post-UAT Workflow Corrections & Functional Enhancements Walkthrough

All requirements and workflow corrections from the Post-UAT review have been systematically implemented, hardened, and verified with 100% test pass rates and clean production builds.

---

## 1. Summary of Changes & Problem Resolution

### 1.1 Newly Created Assignments Timer Lifecycle (Root Cause Resolution)
- **Root Cause Isolated**: `createContentItem` in [`lib/context/AppStateContext.tsx`](file:///Users/aceassured/Ace-tracker/lib/context/AppStateContext.tsx) previously generated `ContentItem`, `SubmissionVersion`, and `DeadlineRecord`, but omitted the generation of an authoritative `ContentAssignment` record.
- **Resolution**:
  - `createContentItem` now atomically instantiates a corresponding `ContentAssignment` record whenever an item is created.
  - `startWorkSession` was fortified to auto-resolve or instantiate the active assignment on-the-fly if needed, ensuring no newly created task/deliverable is ever in an orphaned unassigned state.
  - `app/(dashboard)/projects/[projectId]/content/[itemId]/page.tsx` now exposes `[ Accept Deliverable Assignment ]` and `[ Start Work (Start Timer) ]` seamlessly for runtime-created items.
  - **Verified** by [`tests/rendered/new-assignment-timer.test.tsx`](file:///Users/aceassured/Ace-tracker/tests/rendered/new-assignment-timer.test.tsx).

---

### 1.2 Security Matrix & Designer Date Protection
- **Authoritative Date Protection**:
  - `updateDeadline` denies `role === 'designer'` when attempting to modify `kind === 'scheduled_publication'`.
  - `updatePublicationDetails` rejects `role === 'designer'` and `role === 'client'` with 403 / unauthorized error.
  - Calendar UI hides the `[ Quick Schedule Item ]` button and date modification controls for Designers, rendering a read-only schedule view.
- **External Review Links Gating**:
  - `generateExternalReviewLink` denies `designer` and `client` roles from generating guest review links.
  - **Verified** by [`tests/unit/designer-date-permission.test.tsx`](file:///Users/aceassured/Ace-tracker/tests/unit/designer-date-permission.test.tsx).

---

### 1.3 Project Assigned Work & Clear Ownership Visibility
- **Project Assigned Work Board** in [`app/(dashboard)/projects/[projectId]/page.tsx`](file:///Users/aceassured/Ace-tracker/app/%28dashboard%29/projects/%5BprojectId%5D/page.tsx):
  - Added an interactive table showing Deliverable Title, Platform, Scope Classification, Primary Designer (with avatar), Assignment Status, Due Date, Verified Tracked Effort, and direct Workspace link.
  - 4-part filter toolbar: Filter by Designer, Status, Scope Classification, and Platform.
  - Clearly distinguishes assignments between different designers and highlights items assigned to the active user.

---

### 1.4 Review Queue Approvals & Fast-Track Creation Shortcut
- **Review Queue Page** in [`app/(dashboard)/projects/[projectId]/approvals/page.tsx`](file:///Users/aceassured/Ace-tracker/app/%28dashboard%29/projects/%5BprojectId%5D/approvals/page.tsx):
  - Component Badges: Clearly displays live 3-component matrix decisions for Copy, Creative, and Posting Date (Approved, Changes Requested, Pending).
  - Fast-Track Shortcut: Added `[ + Add Creative for Review ]` button for Management (`founder`, `consultant`, `admin`) that creates the deliverable and immediately queues it in the review queue.
  - Formatted empty state informing users that items appear upon formal designer submission.

---

### 1.5 Multi-Platform Quick Schedule & PDF Carousel Support
- **Multi-Platform Quick Schedule**:
  - Updated Calendar Quick Schedule in [`app/(dashboard)/projects/[projectId]/calendar/page.tsx`](file:///Users/aceassured/Ace-tracker/app/%28dashboard%29/projects/%5BprojectId%5D/calendar/page.tsx) to support multi-platform checkboxes (Instagram, Facebook, LinkedIn, YouTube, X, Email).
  - Automatically invokes `createContentGroupWithItems` to generate 1 `ContentGroup` + N platform deliverables + N `ContentAssignment` records.
- **PDF Carousel Creative Upload & Download**:
  - In [`app/(dashboard)/projects/[projectId]/content/[itemId]/page.tsx`](file:///Users/aceassured/Ace-tracker/app/%28dashboard%29/projects/%5BprojectId%5D/content/%5BitemId%5D/page.tsx), creatives with `mimeType === 'application/pdf'` render a PDF card with direct `[ Download Original PDF ]` and `[ Preview Fullscreen ]` actions.

---

### 1.6 Project Engagement Models & Goodwill Tracking
- **Models Supported**:
  1. **Deliverable-Based**: Tracks contracted quota completion (`Completed / Target`) while separately presenting `Goodwill Delivered` and `Additional Billable` counters.
  2. **Objective-Based**: Tracks business goals (e.g. `500 Qualified Leads`) with `Current Attained / Contract Target` progress bars and interactive management updater.
- **Project Creation Wizard** in [`app/(dashboard)/projects/page.tsx`](file:///Users/aceassured/Ace-tracker/app/%28dashboard%29/projects/page.tsx) updated with engagement model selectors and quota/objective configurations.
- **Verified** by [`tests/unit/project-engagement-models.test.tsx`](file:///Users/aceassured/Ace-tracker/tests/unit/project-engagement-models.test.tsx).

---

### 1.7 Navigation, Header, & Collapsible Sidebar
- **Header Project Switcher** in [`components/layout/Header.tsx`](file:///Users/aceassured/Ace-tracker/components/layout/Header.tsx):
  - Fixed `handleProjectSwitch` to reliably navigate to `/projects/${newProjectId}` from anywhere in the application.
- **Collapsible Responsive Sidebar** in [`components/layout/Sidebar.tsx`](file:///Users/aceassured/Ace-tracker/components/layout/Sidebar.tsx):
  - User-controlled toggle button with `aria-label="Collapse project navigation"` / `aria-label="Expand project navigation"`.
  - Stored in `localStorage("acecore_sidebar_collapsed")`.
  - Icon-only rail mode (70px) with tooltips and expanded mode (256px).
  - Renamed `"Settings & Team"` $\to$ `"Settings"` (since global team is at `/team`).

---

## 2. Verification Results

```bash
npx vitest run
# Output:
# Test Files  42 passed (42)
# Tests       178 passed (178)

npm run build
# Output:
# ✓ Compiled successfully
# ✓ Generating static pages (14/14)
# Finalizing page optimization ... Exit code 0
```

---

## 3. Production Hardening: Guest Review DTO, Client Visibility, Team Profiles & Performance Scoping

### 3.1 Cloudflare Worker Error 1102 (CPU Limit Exceeded) Resolution
- **Root Cause**: `lib/db/index.ts` was invoking `neon(getDatabaseUrl())` inside `getNeonClient()` on every single query execution, creating 15+ HTTP client instances per page render and exceeding Cloudflare Workers CPU time budget (Error 1102).
- **Resolution**: Cached the Neon HTTP client singleton via module-level memoization. Worker startup time dropped to **22 ms** and page render executed cleanly under CPU limits.

### 3.2 Guest Review DTO Incomplete Copy & Creative Asset Serving Fix
- **Root Cause**: `verifyExternalReviewTokenAction` previously selected only the raw `submission_versions` row without mapping the `copy` nested object (`caption`, `hashtags`, `cta`, `destinationUrl`) and without joining `submission_assets` $\rightarrow$ `creative_assets`.
- **Resolution**:
  - Joined `submission_assets` with `creative_assets` for the bound version, generating short-lived signed R2 preview URLs for video, PDF, and image assets.
  - Mapped complete `copy` payload with top-level backward compatibility.
  - Implemented `getGuestAuthorizedAssetDownloadUrlAction` in [`lib/actions/collaboration.ts`](file:///Users/aceassured/Ace-tracker/lib/actions/collaboration.ts), restricting asset downloads strictly to assets attached to the exact token-bound submission version.
  - Upgraded [`app/guest/review/[token]/page.tsx`](file:///Users/aceassured/Ace-tracker/app/guest/review/[token]/page.tsx) to render full-width HTML5 `<video>`, PDF preview/download, images, explicit Call to Action buttons, destination URLs, and hashtags.

### 3.3 Client Portal Visibility Toggle Mutation & Persistence
- **Root Cause**: UI state toggled locally without authoritative PostgreSQL synchronization or actor authorization checks.
- **Resolution**:
  - Hardened `setClientVisibilityAction` in [`lib/actions/content.ts`](file:///Users/aceassured/Ace-tracker/lib/actions/content.ts) to resolve authoritative user session, verify management role (`founder`, `admin`, `consultant`), persist `client_visible` directly in PostgreSQL, and revalidate workspace entities.
  - Updated [`app/(dashboard)/projects/[projectId]/content/[itemId]/page.tsx`](file:///Users/aceassured/Ace-tracker/app/(dashboard)/projects/[projectId]/content/[itemId]/page.tsx) to await the server action and update state upon authoritative success.

### 3.4 Team Member Profile Edits Persistence & Auth.js Safety Guard
- **Root Cause**: Team member profile edits in the modal updated only in-memory `AppStateContext` without persisting to `users` and `employee_capacity_schedules`.
- **Resolution**:
  - Implemented `updateTeamMemberAction` in [`lib/actions/team.ts`](file:///Users/aceassured/Ace-tracker/lib/actions/team.ts):
    - **Auth.js Safeguard**: If `authUserId IS NOT NULL` (account linked to Google/OAuth), email edits are blocked with: `"Login email cannot be changed because this account is already linked to a Google/OAuth identity."`
    - If unlinked, validates unique normalized email and updates email safely.
    - Persists `fullName`, `organizationRole`, `status`, and `jobTitle` to `users`.
    - Persists `primaryFunction`, `creativeEligibility`, and weekday working hours to `employee_capacity_schedules`.
  - Wired `handleEditSave` in [`app/(dashboard)/team/[userId]/page.tsx`](file:///Users/aceassured/Ace-tracker/app/(dashboard)/team/[userId]/page.tsx) to invoke `updateTeamMemberAction`.

### 3.5 Project Performance Assigned Team Scoping
- **Root Cause**: `getOrganizationPerformance` in [`lib/performance.ts`](file:///Users/aceassured/Ace-tracker/lib/performance.ts) and project performance filters fell back to organization-wide designers.
- **Resolution**:
  - In `getOrganizationPerformance`, when `filters.projectId` is present, contributors are strictly filtered to active `project_memberships` with eligible contributor roles (`consultant`, `designer`, `video_editor`, `collaborator`). Unrelated employees and Clients are completely excluded.
  - For historical periods, former contributors with actual work recorded during the period are retained and clearly labeled `(Former Contributor)`.
  - Zero-member state renders: `"No active team members assigned to this project."`

### 3.6 Live Production Deployment & Automated Verification
- **Cloudflare Worker Deployed**: Version ID `d6afabc7-d668-4ca1-9c40-8e5d3e1f315a` (`https://acecore.ace-tracker.workers.dev`).
- **Live Script Verification**: Executed `scratch/verify_live_acceptance_batch.ts` against the live production database with **100% PASS**:
  - **Guest Review DTO**: Version 6 rendered complete caption, hashtags, CTA, and attached creative asset preview.
  - **Asset Security**: Token-bound asset authorized successfully (`Success: true`); unattached asset blocked (`Error: Unauthorized: Asset not attached to this review version`).
  - **Client Visibility**: Toggle OFF persisted `client_visible = false`; Toggle ON persisted `client_visible = true`.
  - **Profile Persistence**: Working hours updated to 7.5 and verified in PostgreSQL; restored to 8.0.
  - **Auth.js Guard**: Email change blocked on linked account (`Login email cannot be changed because this account is already linked to a Google/OAuth identity`).
  - **Project Performance**: CraftXSpaces rendered exactly its 3 active contributors (`Kumarahaari`, `Chandrasekar`, `Ramesh`) with zero unrelated employees and zero clients.

