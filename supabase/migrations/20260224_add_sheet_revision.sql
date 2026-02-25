-- Add sheet number, revision, and parent_id to models table for revision control
-- parent_id links all revisions of the same sheet together.
-- The first upload for a sheet sets parent_id = its own id.
-- Subsequent revisions of the same sheet reference the original parent_id.

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS sheet_number TEXT,
  ADD COLUMN IF NOT EXISTS revision TEXT DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES models(id);

-- Index for fast lookups: all revisions of a sheet
CREATE INDEX IF NOT EXISTS idx_models_parent_id ON models(parent_id);

-- Index for finding latest revision per sheet within a company
CREATE INDEX IF NOT EXISTS idx_models_company_sheet ON models(company_id, sheet_number);
