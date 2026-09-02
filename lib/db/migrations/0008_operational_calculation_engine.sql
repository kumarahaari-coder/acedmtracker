-- Migration: 0008_operational_calculation_engine.sql
-- Description: Add PostgreSQL tables and columns for Effort Standards Master (38 standards), Employee Capacity Schedules, Capacity Adjustments, Project Commitments, Performance Inputs, and Task Planning/Effort Snapshots.

-- 1. Master Effort Standards
CREATE TABLE IF NOT EXISTS effort_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  work_type VARCHAR(100) NOT NULL,
  content_seconds INTEGER NOT NULL DEFAULT 0,
  production_seconds INTEGER NOT NULL DEFAULT 0,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  lead_time_workdays INTEGER NOT NULL DEFAULT 2,
  default_role VARCHAR(50) NOT NULL DEFAULT 'designer',
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_effort_standards_org_work_type_version UNIQUE(org_id, work_type, version),
  CONSTRAINT chk_effort_content_seconds CHECK (content_seconds >= 0),
  CONSTRAINT chk_effort_production_seconds CHECK (production_seconds >= 0),
  CONSTRAINT chk_effort_total_seconds CHECK (total_seconds >= 0),
  CONSTRAINT chk_effort_lead_time CHECK (lead_time_workdays >= 0)
);

CREATE INDEX IF NOT EXISTS idx_effort_standards_org_cat ON effort_standards(org_id, category);
CREATE INDEX IF NOT EXISTS idx_effort_standards_active ON effort_standards(org_id, active);

-- 2. Employee Capacity Schedules (Historical Versioning)
CREATE TABLE IF NOT EXISTS employee_capacity_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  monday_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  tuesday_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  wednesday_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  thursday_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  friday_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  saturday_hours NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  sunday_hours NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  primary_function VARCHAR(100) NOT NULL DEFAULT 'Creative',
  creative_eligibility VARCHAR(50) NOT NULL DEFAULT 'primary' CHECK (creative_eligibility IN ('primary', 'backup', 'not_eligible')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cap_mon CHECK (monday_hours >= 0 AND monday_hours <= 24),
  CONSTRAINT chk_cap_tue CHECK (tuesday_hours >= 0 AND tuesday_hours <= 24),
  CONSTRAINT chk_cap_wed CHECK (wednesday_hours >= 0 AND wednesday_hours <= 24),
  CONSTRAINT chk_cap_thu CHECK (thursday_hours >= 0 AND thursday_hours <= 24),
  CONSTRAINT chk_cap_fri CHECK (friday_hours >= 0 AND friday_hours <= 24),
  CONSTRAINT chk_cap_sat CHECK (saturday_hours >= 0 AND saturday_hours <= 24),
  CONSTRAINT chk_cap_sun CHECK (sunday_hours >= 0 AND sunday_hours <= 24)
);

CREATE INDEX IF NOT EXISTS idx_emp_capacity_user_dates ON employee_capacity_schedules(user_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_emp_capacity_org_user ON employee_capacity_schedules(org_id, user_id);

-- 3. Dated Capacity Adjustments
CREATE TABLE IF NOT EXISTS capacity_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adjustment_date DATE NOT NULL,
  kind VARCHAR(50) NOT NULL CHECK (kind IN ('leave', 'holiday', 'overtime', 'manual')),
  adjustment_hours NUMERIC(4,2) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capacity_adj_user_date ON capacity_adjustments(user_id, adjustment_date);
CREATE INDEX IF NOT EXISTS idx_capacity_adj_org_date ON capacity_adjustments(org_id, adjustment_date);

-- 4. Project Monthly Commitments
CREATE TABLE IF NOT EXISTS project_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_type_id UUID REFERENCES effort_standards(id) ON DELETE SET NULL,
  work_type_name VARCHAR(100) NOT NULL,
  committed_quantity INTEGER NOT NULL DEFAULT 0,
  effective_month DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_commitments_proj_work_month UNIQUE(project_id, work_type_name, effective_month),
  CONSTRAINT chk_committed_qty CHECK (committed_quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_proj_commitments_org_month ON project_commitments(org_id, effective_month);

-- 5. Periodic Advertising / Performance Project Inputs
CREATE TABLE IF NOT EXISTS project_performance_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  effective_month DATE NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  ad_budget NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ad_spend NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  leads INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_perf_leads CHECK (leads >= 0),
  CONSTRAINT chk_perf_conv CHECK (conversions >= 0),
  CONSTRAINT chk_perf_budget CHECK (ad_budget >= 0),
  CONSTRAINT chk_perf_spend CHECK (ad_spend >= 0)
);

CREATE INDEX IF NOT EXISTS idx_proj_perf_org_month ON project_performance_inputs(org_id, effective_month);

-- 6. Add Task Planning and Effort Snapshot Columns to content_items
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS work_type VARCHAR(100) NOT NULL DEFAULT 'Short-form Reel';
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS work_type_id UUID REFERENCES effort_standards(id) ON DELETE SET NULL;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS content_pillar VARCHAR(100);
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS topic VARCHAR(255);
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS brief TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS reference_link TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal';
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS work_nature VARCHAR(30) NOT NULL DEFAULT 'planned';
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS account_owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS calculated_internal_deadline TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS final_internal_deadline TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS deadline_override_reason TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS standard_content_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS standard_production_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS revision_content_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS revision_production_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS final_planned_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Constraints for content_items operational columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_content_items_priority') THEN
    ALTER TABLE content_items ADD CONSTRAINT chk_content_items_priority CHECK (priority IN ('urgent', 'normal', 'low'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_content_items_work_nature') THEN
    ALTER TABLE content_items ADD CONSTRAINT chk_content_items_work_nature CHECK (work_nature IN ('planned', 'ad_hoc'));
  END IF;
END $$;

-- 7. Enable RLS on all operational tables
ALTER TABLE effort_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_capacity_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacity_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_performance_inputs ENABLE ROW LEVEL SECURITY;

-- 8. Seed the exact 38 workbook Effort Standards for all organizations
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    INSERT INTO effort_standards (org_id, category, work_type, content_seconds, production_seconds, total_seconds, lead_time_workdays, default_role, active, version)
    VALUES
      -- Static
      (org.id, 'Static', 'Simple Static Poster', 1800, 3600, 5400, 1, 'Designer', true, 1),
      (org.id, 'Static', 'Premium / Custom Poster', 2700, 7200, 9900, 2, 'Designer', true, 1),
      (org.id, 'Static', 'Offer / Promotional Creative', 1800, 3600, 5400, 1, 'Designer', true, 1),
      (org.id, 'Static', 'Story Creative', 900, 1800, 2700, 1, 'Designer', true, 1),
      (org.id, 'Static', 'LinkedIn Creative', 1800, 3600, 5400, 1, 'Designer', true, 1),
      (org.id, 'Static', 'Thumbnail', 900, 1800, 2700, 1, 'Designer', true, 1),
      (org.id, 'Static', 'Banner / Website Creative', 1800, 5400, 7200, 2, 'Designer', true, 1),
      (org.id, 'Static', 'Infographic', 2700, 9000, 11700, 2, 'Designer', true, 1),
      -- Carousel
      (org.id, 'Carousel', 'Simple Carousel', 2700, 9000, 11700, 2, 'Designer', true, 1),
      (org.id, 'Carousel', 'Content-heavy Carousel', 3600, 12600, 16200, 2, 'Designer', true, 1),
      (org.id, 'Carousel', 'Premium Carousel', 3600, 16200, 19800, 2, 'Designer', true, 1),
      -- Video
      (org.id, 'Video', 'Basic Reel - Supplied Footage', 2700, 7200, 9900, 2, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Short-form Reel', 2700, 10800, 13500, 2, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Reel - Stock + Supplied Footage', 2700, 10800, 13500, 2, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Reel - Subtitles / Standard Polish', 2700, 10800, 13500, 2, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Motion Graphics Reel', 3600, 16200, 19800, 3, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Premium Reel', 3600, 18000, 21600, 3, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Talking-head / Founder Edit', 1800, 9000, 10800, 2, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Podcast Short', 1800, 7200, 9000, 2, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'Long-form Video Edit', 3600, 21600, 25200, 4, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'AI-generated Video', 3600, 14400, 18000, 3, 'Designer/Editor', true, 1),
      (org.id, 'Video', 'AI Avatar Video', 2700, 10800, 13500, 3, 'Designer/Editor', true, 1),
      -- Content
      (org.id, 'Content', 'Caption', 1800, 0, 1800, 1, 'Account Manager', true, 1),
      (org.id, 'Content', 'Carousel Copy', 2700, 0, 2700, 1, 'Account Manager', true, 1),
      (org.id, 'Content', 'Reel Script', 2700, 0, 2700, 1, 'Account Manager', true, 1),
      (org.id, 'Content', 'LinkedIn Post Copy', 2700, 0, 2700, 1, 'Account Manager', true, 1),
      (org.id, 'Content', 'Blog', 9000, 0, 9000, 3, 'Account Manager', true, 1),
      (org.id, 'Content', 'Research / Content Brief', 3600, 0, 3600, 1, 'Account Manager', true, 1),
      -- Operations
      (org.id, 'Operations', 'Monthly Content Calendar', 14400, 0, 14400, 5, 'Account Manager', true, 1),
      (org.id, 'Operations', 'Monthly Report', 7200, 0, 7200, 3, 'Account Manager', true, 1),
      (org.id, 'Operations', 'Upload / Scheduling', 900, 0, 900, 1, 'Account Manager', true, 1),
      (org.id, 'Operations', 'Community Management', 0, 0, 0, 0, 'Account Manager', true, 1),
      -- Advertising
      (org.id, 'Advertising', 'Ad Creative', 2700, 5400, 8100, 2, 'Designer/Editor', true, 1),
      (org.id, 'Advertising', 'Campaign Setup', 7200, 0, 7200, 2, 'Account Manager', true, 1),
      -- Web/UI
      (org.id, 'Web/UI', 'Landing Page', 0, 3600, 3600, 0, 'UX Designer', true, 1),
      (org.id, 'Web/UI', 'Website Page', 0, 3600, 3600, 0, 'UX Designer', true, 1),
      -- Non-Creative
      (org.id, 'Non-Creative', 'Meeting', 0, 0, 0, 0, 'Account Manager', true, 1),
      (org.id, 'Non-Creative', 'Research', 0, 0, 0, 0, 'Account Manager', true, 1)
    ON CONFLICT (org_id, work_type, version) DO NOTHING;
  END LOOP;
END $$;
