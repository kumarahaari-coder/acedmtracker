-- ============================================================================
-- AceCore Phase B — Milestone 2 Production Migration (Additive)
-- Content: ContentGroups, ContentItems, SubmissionVersions, CreativeAssets, SubmissionAssets
-- Target Runtime: PostgreSQL 16+ (Neon Serverless) with RLS & app_user Role
-- ============================================================================

-- 1. Content Groups (Multi-Platform Campaign Groups)
CREATE TABLE IF NOT EXISTS content_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    concept_notes TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_content_groups_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_groups_project_id ON content_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_content_groups_org_id ON content_groups(org_id);

-- 2. Content Items (Platform-Specific Content Records)
-- NOTE: Ownership/Assignment fields intentionally removed; managed by ContentAssignment.
CREATE TABLE IF NOT EXISTS content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    content_group_id UUID REFERENCES content_groups(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'X', 'Email')),
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('post', 'carousel', 'reel', 'trial_reel')),
    stage VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (stage IN ('idea', 'draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'insights_pending', 'reported')),
    scope_classification VARCHAR(50) NOT NULL DEFAULT 'contracted' CHECK (scope_classification IN ('contracted', 'goodwill', 'additional_billable')),
    client_visible BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    live_url TEXT,
    published_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    current_version_number INTEGER NOT NULL DEFAULT 1,
    submission_deadline TIMESTAMPTZ,
    resubmission_deadline TIMESTAMPTZ,
    approval_target TIMESTAMPTZ,
    scheduled_publication_date TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'trash')),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_content_items_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_items_proj_stage ON content_items(project_id, stage);
CREATE INDEX IF NOT EXISTS idx_content_items_sched_date ON content_items(project_id, scheduled_publication_date);
CREATE INDEX IF NOT EXISTS idx_content_items_group_id ON content_items(content_group_id);

-- 3. Submission Versions (Sequential Immutable Submissions)
CREATE TABLE IF NOT EXISTS submission_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    is_draft BOOLEAN NOT NULL DEFAULT TRUE,
    caption TEXT NOT NULL DEFAULT '',
    hashtags TEXT[] NOT NULL DEFAULT '{}',
    cta TEXT NOT NULL DEFAULT '',
    destination_url TEXT,
    scheduled_date TIMESTAMPTZ,
    copy_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
    creative_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
    posting_date_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(content_item_id, version_number),
    UNIQUE(project_id, id),
    CONSTRAINT fk_submission_versions_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

-- Invariant: At most ONE active draft version per content item
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_draft_per_item 
ON submission_versions(content_item_id) 
WHERE is_draft = true;

CREATE INDEX IF NOT EXISTS idx_submission_versions_item_id ON submission_versions(content_item_id);
CREATE INDEX IF NOT EXISTS idx_submission_versions_project_id ON submission_versions(project_id);

-- 4. Creative Assets (Vault of Binary Assets stored in Cloudflare R2)
CREATE TABLE IF NOT EXISTS creative_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    r2_object_key TEXT NOT NULL UNIQUE,
    original_filename VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed', 'expired')),
    expires_at TIMESTAMPTZ,
    is_drive_link BOOLEAN NOT NULL DEFAULT FALSE,
    drive_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, id),
    CONSTRAINT fk_creative_assets_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creative_assets_project_id ON creative_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_creative_assets_status_exp ON creative_assets(status, expires_at);

-- 5. Submission Assets (Junction connecting SubmissionVersion to CreativeAsset)
CREATE TABLE IF NOT EXISTS submission_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_version_id UUID NOT NULL REFERENCES submission_versions(id) ON DELETE CASCADE,
    creative_asset_id UUID NOT NULL REFERENCES creative_assets(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(submission_version_id, creative_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_assets_version ON submission_assets(submission_version_id);
CREATE INDEX IF NOT EXISTS idx_submission_assets_asset ON submission_assets(creative_asset_id);

-- ============================================================================
-- Triggers: Enforce Submitted Version Immutability
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_prevent_submitted_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- If version is already submitted (is_draft = false), reject modifications to content/fingerprints
  IF OLD.is_draft = false THEN
    IF (NEW.caption != OLD.caption OR
        NEW.hashtags != OLD.hashtags OR
        NEW.cta != OLD.cta OR
        NEW.destination_url IS DISTINCT FROM OLD.destination_url OR
        NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR
        NEW.copy_fingerprint != OLD.copy_fingerprint OR
        NEW.creative_fingerprint != OLD.creative_fingerprint OR
        NEW.posting_date_fingerprint != OLD.posting_date_fingerprint) THEN
      RAISE EXCEPTION 'Immutable Submission: Submitted versions cannot be modified.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_submitted_version_immutable ON submission_versions;
CREATE TRIGGER check_submitted_version_immutable
BEFORE UPDATE ON submission_versions
FOR EACH ROW
EXECUTE FUNCTION trg_prevent_submitted_version_mutation();

-- ============================================================================
-- Row-Level Security (RLS) Policies (Milestone 2 Tables)
-- ============================================================================

-- A. Content Groups RLS (Internal only: Clients receive 0 rows)
ALTER TABLE content_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_groups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_content_groups_select ON content_groups;
CREATE POLICY rls_content_groups_select ON content_groups
    FOR SELECT
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

DROP POLICY IF EXISTS rls_content_groups_write ON content_groups;
CREATE POLICY rls_content_groups_write ON content_groups
    FOR ALL
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    )
    WITH CHECK (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

-- B. Content Items RLS
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_content_items_select ON content_items;
CREATE POLICY rls_content_items_select ON content_items
    FOR SELECT
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND (
        -- Client can ONLY view client_visible active items on their project
        (
          get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) = 'client'
          AND client_visible = true
          AND status = 'active'
          AND is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
        OR
        -- Internal staff can view items on assigned project (or org-wide for Admin)
        (
          get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
          AND (
            is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
            OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
          )
        )
      )
    );

DROP POLICY IF EXISTS rls_content_items_write ON content_items;
CREATE POLICY rls_content_items_write ON content_items
    FOR ALL
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    )
    WITH CHECK (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

-- C. Submission Versions RLS (Internal only: Clients receive 0 rows)
ALTER TABLE submission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_submission_versions_select ON submission_versions;
CREATE POLICY rls_submission_versions_select ON submission_versions
    FOR SELECT
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

DROP POLICY IF EXISTS rls_submission_versions_write ON submission_versions;
CREATE POLICY rls_submission_versions_write ON submission_versions
    FOR ALL
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    )
    WITH CHECK (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

-- D. Creative Assets RLS
ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_creative_assets_select ON creative_assets;
CREATE POLICY rls_creative_assets_select ON creative_assets
    FOR SELECT
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

DROP POLICY IF EXISTS rls_creative_assets_write ON creative_assets;
CREATE POLICY rls_creative_assets_write ON creative_assets
    FOR ALL
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    )
    WITH CHECK (
      org_id::text = current_setting('app.current_org_id', true)
      AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer')
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

-- E. Submission Assets RLS
ALTER TABLE submission_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_submission_assets_select ON submission_assets;
CREATE POLICY rls_submission_assets_select ON submission_assets
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM submission_versions sv
        WHERE sv.id = submission_assets.submission_version_id
          AND sv.org_id::text = current_setting('app.current_org_id', true)
          AND (
            is_active_org_admin(sv.org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
            OR is_active_project_member(sv.project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
          )
      )
    );

DROP POLICY IF EXISTS rls_submission_assets_write ON submission_assets;
CREATE POLICY rls_submission_assets_write ON submission_assets
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM submission_versions sv
        WHERE sv.id = submission_assets.submission_version_id
          AND sv.org_id::text = current_setting('app.current_org_id', true)
          AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, sv.org_id) IN ('founder', 'admin', 'consultant', 'designer')
          AND (
            is_active_org_admin(sv.org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
            OR is_active_project_member(sv.project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
          )
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM submission_versions sv
        WHERE sv.id = submission_assets.submission_version_id
          AND sv.org_id::text = current_setting('app.current_org_id', true)
          AND get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, sv.org_id) IN ('founder', 'admin', 'consultant', 'designer')
          AND (
            is_active_org_admin(sv.org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
            OR is_active_project_member(sv.project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
          )
      )
    );

-- Table Grants for app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON content_groups TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON content_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON submission_versions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON creative_assets TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON submission_assets TO app_user;
