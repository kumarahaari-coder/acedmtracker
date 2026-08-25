-- ============================================================================
-- AceCore Phase B — Milestone 3 Complete Production Schema Migration (Additive)
-- Domains: Assignments, Approvals, Work Sessions, Attendance, Collaboration, Audit, Analytics
-- Target Runtime: PostgreSQL 16+ (Neon Serverless) with RLS & app_user Role
-- ============================================================================

-- 1. Content Assignments
CREATE TABLE IF NOT EXISTS content_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    assignee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assignment_role VARCHAR(50) NOT NULL DEFAULT 'designer' CHECK (assignment_role IN ('designer', 'video_editor', 'collaborator')),
    status VARCHAR(50) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'in_progress', 'submitted', 'reassigned', 'completed')),
    assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    initial_due_at TIMESTAMPTZ NOT NULL,
    current_due_at TIMESTAMPTZ NOT NULL,
    first_submitted_at TIMESTAMPTZ,
    reassignment_reason TEXT,
    replaced_assignment_id UUID REFERENCES content_assignments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_content_assignments_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_assignment_per_item
ON content_assignments(content_item_id)
WHERE status IN ('assigned', 'accepted', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_content_assignments_proj_user ON content_assignments(project_id, assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_content_assignments_item_id ON content_assignments(content_item_id);

-- 2. Assignment Deadline History
CREATE TABLE IF NOT EXISTS assignment_deadline_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES content_assignments(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    previous_due_at TIMESTAMPTZ NOT NULL,
    new_due_at TIMESTAMPTZ NOT NULL,
    changed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_assignment_deadline_history_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_deadline_history_asgn ON assignment_deadline_history(assignment_id);

-- 3. Approval Decisions
CREATE TABLE IF NOT EXISTS approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    submission_version_id UUID NOT NULL REFERENCES submission_versions(id) ON DELETE CASCADE,
    component VARCHAR(50) NOT NULL CHECK (component IN ('copy', 'creative', 'posting_date')),
    component_fingerprint VARCHAR(64) NOT NULL,
    reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewer_role VARCHAR(50) NOT NULL CHECK (reviewer_role IN ('founder', 'consultant')),
    decision VARCHAR(50) NOT NULL CHECK (decision IN ('pending', 'approved', 'changes_requested', 'approved_with_conditions')),
    note TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    revoked_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_approval_decisions_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_version ON approval_decisions(submission_version_id);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_item ON approval_decisions(content_item_id);

-- 4. Founder Overrides
CREATE TABLE IF NOT EXISTS founder_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    submission_version_id UUID NOT NULL REFERENCES submission_versions(id) ON DELETE CASCADE,
    component VARCHAR(50) CHECK (component IN ('copy', 'creative', 'posting_date')),
    reason TEXT NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_founder_overrides_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_founder_overrides_item ON founder_overrides(content_item_id);

-- 5. Change Requests
CREATE TABLE IF NOT EXISTS change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    submission_version_id UUID NOT NULL REFERENCES submission_versions(id) ON DELETE CASCADE,
    component VARCHAR(50) NOT NULL CHECK (component IN ('copy', 'creative', 'posting_date')),
    reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    requested_change TEXT NOT NULL,
    priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'blocker')),
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed', 'resolved', 'waived', 'disputed')),
    resolution_reason TEXT,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_change_requests_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_change_requests_item_status ON change_requests(content_item_id, status);
CREATE INDEX IF NOT EXISTS idx_change_requests_version ON change_requests(submission_version_id);

-- 6. Change Request Responses
CREATE TABLE IF NOT EXISTS change_request_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_request_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    responder_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    response_text TEXT NOT NULL,
    evidence_asset_id UUID REFERENCES creative_assets(id) ON DELETE SET NULL,
    addressed_in_version_id UUID REFERENCES submission_versions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_change_request_responses_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_change_request_responses_cr_id ON change_request_responses(change_request_id);

-- 7. Work Sessions (Server-Authoritative Timers)
CREATE TABLE IF NOT EXISTS work_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES content_assignments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    accumulated_seconds INTEGER NOT NULL DEFAULT 0,
    active_segment_started_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_work_sessions_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

-- Invariant: At most ONE active timer session per user across the platform
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_work_session_per_user
ON work_sessions(user_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_work_sessions_user_status ON work_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_asgn ON work_sessions(assignment_id);

-- 8. Work Session Adjustments
CREATE TABLE IF NOT EXISTS work_session_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    previous_duration_seconds INTEGER NOT NULL,
    adjusted_duration_seconds INTEGER NOT NULL,
    reason TEXT NOT NULL,
    adjusted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_work_session_adjustments_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

-- 9. Attendance Records
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    attendance_date DATE NOT NULL,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_out_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'checked_in' CHECK (status IN ('checked_in', 'checked_out')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date ON attendance_records(user_id, attendance_date);

-- 10. Attendance Corrections
CREATE TABLE IF NOT EXISTS attendance_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_check_in TIMESTAMPTZ,
    new_check_in TIMESTAMPTZ,
    previous_check_out TIMESTAMPTZ,
    new_check_out TIMESTAMPTZ,
    changed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Comments
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    submission_version_id UUID REFERENCES submission_versions(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    external_reviewer_name VARCHAR(255),
    visibility VARCHAR(50) NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'external')),
    body TEXT NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_comments_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_item_vis ON comments(content_item_id, visibility);

-- 12. Visual Annotations
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    asset_id UUID NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('point', 'region', 'video_timestamp', 'pdf_page')),
    x DOUBLE PRECISION,
    y DOUBLE PRECISION,
    width DOUBLE PRECISION,
    height DOUBLE PRECISION,
    timestamp_seconds DOUBLE PRECISION,
    page_number INTEGER,
    CONSTRAINT fk_annotations_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

-- 13. External Review Tokens
CREATE TABLE IF NOT EXISTS external_review_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    submission_version_id UUID NOT NULL REFERENCES submission_versions(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    allow_download BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_external_review_tokens_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_external_review_tokens_hash ON external_review_tokens(token_hash);

-- 14. Audit Records
CREATE TABLE IF NOT EXISTS audit_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary TEXT NOT NULL,
    reason TEXT,
    before_state JSONB,
    after_state JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_records_org_time ON audit_records(org_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_records_proj_time ON audit_records(project_id, timestamp DESC);

-- 15. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_notifications_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient_user_id, read_at);

-- 16. Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'paused')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_campaigns_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

-- 17. Scripts
CREATE TABLE IF NOT EXISTS scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    linked_content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_progress', 'ready', 'linked')),
    hook TEXT NOT NULL DEFAULT '',
    scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
    cta TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    music_track VARCHAR(255),
    music_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_scripts_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

-- 18. Analytics Snapshots
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    snapshot_date TIMESTAMPTZ NOT NULL,
    platform VARCHAR(50) NOT NULL,
    reach INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    engagement_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    leads INTEGER NOT NULL DEFAULT 0,
    revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_analytics_snapshots_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_item_date ON analytics_snapshots(content_item_id, snapshot_date DESC);

-- ============================================================================
-- Row-Level Security (RLS) Policies (All Internal Staff & Client Denial)
-- ============================================================================

-- Macro for enabling and forcing RLS
ALTER TABLE content_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_assignments FORCE ROW LEVEL SECURITY;

ALTER TABLE assignment_deadline_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_deadline_history FORCE ROW LEVEL SECURITY;

ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions FORCE ROW LEVEL SECURITY;

ALTER TABLE founder_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE founder_overrides FORCE ROW LEVEL SECURITY;

ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE change_request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_request_responses FORCE ROW LEVEL SECURITY;

ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE work_session_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_session_adjustments FORCE ROW LEVEL SECURITY;

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;

ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_corrections FORCE ROW LEVEL SECURITY;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;

ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations FORCE ROW LEVEL SECURITY;

ALTER TABLE external_review_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_review_tokens FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_records FORCE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;

ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts FORCE ROW LEVEL SECURITY;

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots FORCE ROW LEVEL SECURITY;

-- Staff-Only RLS Policies (Clients receive 0 rows)
DROP POLICY IF EXISTS rls_content_assignments_select ON content_assignments;
CREATE POLICY rls_content_assignments_select ON content_assignments
    FOR SELECT USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

DROP POLICY IF EXISTS rls_content_assignments_write ON content_assignments;
CREATE POLICY rls_content_assignments_write ON content_assignments
    FOR ALL USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

DROP POLICY IF EXISTS rls_approval_decisions_select ON approval_decisions;
CREATE POLICY rls_approval_decisions_select ON approval_decisions
    FOR SELECT USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

DROP POLICY IF EXISTS rls_approval_decisions_write ON approval_decisions;
CREATE POLICY rls_approval_decisions_write ON approval_decisions
    FOR ALL USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

-- Table Grants for app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON content_assignments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_deadline_history TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON approval_decisions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON founder_overrides TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_requests TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_request_responses TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON work_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON work_session_adjustments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_records TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_corrections TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON comments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON annotations TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON external_review_tokens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_records TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON scripts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON analytics_snapshots TO app_user;
