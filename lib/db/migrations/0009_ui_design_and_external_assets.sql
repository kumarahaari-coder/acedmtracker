-- 0009_ui_design_and_external_assets.sql
-- Additive, backwards-compatible migration for UI Design project type and task metadata.
-- Existing projects default to 'digital_marketing'. Zero data destruction or mutation.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) NOT NULL DEFAULT 'digital_marketing';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS master_figma_url TEXT;

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS figma_url TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS client_delivery_date TIMESTAMPTZ;
