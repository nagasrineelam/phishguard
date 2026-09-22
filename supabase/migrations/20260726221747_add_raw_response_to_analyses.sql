-- Store the full backend response (extraction + prediction) as JSON
ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS raw_response jsonb;