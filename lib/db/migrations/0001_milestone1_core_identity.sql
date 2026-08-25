-- ============================================================================
-- AceCore Phase B — Milestone 1 Production Migration (Hardened)
-- Core Identity: Organizations, Auth Tables, Users, Projects, ProjectMemberships
-- Target Runtime: PostgreSQL 16+ (Neon Serverless) with RLS & app_user Role
-- ============================================================================

-- 0. Roles Setup (app_user does NOT have BYPASSRLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'placeholder_app_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Auth.js v5 Tables
CREATE TABLE IF NOT EXISTS auth_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT UNIQUE,
    email_verified TIMESTAMPTZ,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_accounts (
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    session_token TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_verification_tokens (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- 3. AceCore Application Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    auth_user_id UUID UNIQUE REFERENCES auth_users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    normalized_email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    organization_role VARCHAR(50) NOT NULL DEFAULT 'designer' CHECK (organization_role IN ('founder', 'admin', 'consultant', 'designer', 'client')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(id, org_id) -- Required for composite FKs
);

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_normalized_email ON users(normalized_email);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(org_id, organization_role);

-- 4. Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id VARCHAR(100) UNIQUE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'tier_2' CHECK (tier IN ('tier_1', 'tier_2', 'tier_3')),
    engagement_model VARCHAR(50) NOT NULL DEFAULT 'deliverable_based' CHECK (engagement_model IN ('deliverable_based', 'objective_based')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived', 'trash', 'retained_archive')),
    brand_primary_color VARCHAR(30) DEFAULT '#0071e3',
    brief_markdown TEXT NOT NULL DEFAULT '',
    required_approvers VARCHAR(50) NOT NULL DEFAULT 'both' CHECK (required_approvers IN ('founder', 'consultant', 'both')),
    approval_mode VARCHAR(50) NOT NULL DEFAULT 'parallel' CHECK (approval_mode IN ('parallel', 'sequential')),
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    retained_archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(id, org_id) -- Required for composite FKs
);

CREATE INDEX IF NOT EXISTS idx_projects_org_status ON projects(org_id, status);

-- 5. Project Memberships
CREATE TABLE IF NOT EXISTS project_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    org_id UUID NOT NULL,
    membership_role VARCHAR(50) NOT NULL DEFAULT 'designer' CHECK (membership_role IN ('consultant', 'designer', 'video_editor', 'client', 'collaborator')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by_user_id UUID,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id),
    CONSTRAINT fk_memberships_project_org FOREIGN KEY (project_id, org_id) REFERENCES projects(id, org_id) ON DELETE CASCADE,
    CONSTRAINT fk_memberships_user_org FOREIGN KEY (user_id, org_id) REFERENCES users(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON project_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_project_status ON project_memberships(project_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org_id ON project_memberships(org_id);

-- ============================================================================
-- Helper Functions (SECURITY DEFINER with locked search_path)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_current_user_role(p_user_id UUID, p_org_id UUID)
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT organization_role FROM users
  WHERE id = p_user_id
    AND org_id = p_org_id
    AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION is_active_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_memberships
    WHERE project_id = p_project_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_active_project_consultant(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_memberships
    WHERE project_id = p_project_id
      AND user_id = p_user_id
      AND membership_role = 'consultant'
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_active_org_admin(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND org_id = p_org_id
      AND organization_role IN ('founder', 'admin')
      AND status = 'active'
  );
$$;

-- Grant execution to app_user
REVOKE ALL ON FUNCTION get_current_user_role(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_role(UUID, UUID) TO app_user;

REVOKE ALL ON FUNCTION is_active_project_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_active_project_member(UUID, UUID) TO app_user;

REVOKE ALL ON FUNCTION is_active_project_consultant(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_active_project_consultant(UUID, UUID) TO app_user;

REVOKE ALL ON FUNCTION is_active_org_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_active_org_admin(UUID, UUID) TO app_user;

-- ============================================================================
-- Row-Level Security (RLS) Policies (Hardened for Client Isolation)
-- ============================================================================

-- Organizations RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_org_select ON organizations
    FOR SELECT
    USING (id::text = current_setting('app.current_org_id', true));

-- Users RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- 1. Client users can ONLY select their own record (cannot enumerate internal employees)
-- 2. Internal employees can select internal employees in the same organization
CREATE POLICY rls_users_select ON users
    FOR SELECT
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND (
        -- Client can only view themselves
        (get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) = 'client' 
          AND id::text = current_setting('app.current_user_id', true))
        OR
        -- Internal users can view internal users and client profiles
        (get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('founder', 'admin', 'consultant', 'designer'))
      )
    );

CREATE POLICY rls_users_admin_write ON users
    FOR ALL
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    )
    WITH CHECK (
      org_id::text = current_setting('app.current_org_id', true)
      AND is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    );

-- Projects RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_projects_select ON projects
    FOR SELECT
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND (
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR is_active_project_member(id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      )
    );

CREATE POLICY rls_projects_admin_write ON projects
    FOR ALL
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    )
    WITH CHECK (
      org_id::text = current_setting('app.current_org_id', true)
      AND is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    );

-- Project Memberships RLS
ALTER TABLE project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memberships FORCE ROW LEVEL SECURITY;

-- 1. Client can ONLY select their own membership record (cannot enumerate internal team on project)
-- 2. Internal users can view project memberships for assigned projects or org-wide for Admins
CREATE POLICY rls_memberships_select ON project_memberships
    FOR SELECT
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND (
        -- Client can only view their own membership
        (get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) = 'client' 
          AND user_id::text = current_setting('app.current_user_id', true))
        OR
        -- Org admins can view all project memberships in org
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR
        -- Internal team members can view memberships for projects they belong to
        (
          get_current_user_role(NULLIF(current_setting('app.current_user_id', true), '')::uuid, org_id) IN ('consultant', 'designer')
          AND is_active_project_member(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
      )
    );

-- Write Policy:
-- 1. Org Admins can manage any membership in the org.
-- 2. Consultants can manage CLIENT memberships ONLY on projects where they are active consultants.
CREATE POLICY rls_memberships_write ON project_memberships
    FOR ALL
    USING (
      org_id::text = current_setting('app.current_org_id', true)
      AND (
        -- Org Admin write
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR
        -- Consultant write (strictly client role on assigned project)
        (
          is_active_project_consultant(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
          AND membership_role = 'client'
        )
      )
    )
    WITH CHECK (
      org_id::text = current_setting('app.current_org_id', true)
      AND (
        -- Org Admin write
        is_active_org_admin(org_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR
        -- Consultant write (strictly client role on assigned project)
        (
          is_active_project_consultant(project_id, NULLIF(current_setting('app.current_user_id', true), '')::uuid)
          AND membership_role = 'client'
        )
      )
    );

-- Table Grants for app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_memberships TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_users TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_accounts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_verification_tokens TO app_user;
