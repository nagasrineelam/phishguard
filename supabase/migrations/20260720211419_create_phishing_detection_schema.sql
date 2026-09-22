/*
# Phishing URL Detection — Core Schema

1. Purpose
   Multi-user SaaS for AI-powered phishing URL detection. Users analyze URLs;
   admins moderate reports and retrain the model. Auth is required (sign-in screen
   exists), so all tables are owner-scoped with `auth.uid()` policies.

2. New Tables
   - `profiles` — extends auth.users with display name, role, avatar, prefs.
   - `analyses` — one row per URL analyzed by a user (prediction, confidence, etc.).
   - `reports` — user-submitted "incorrect prediction" reports for admin moderation.
   - `model_info` — single-row table holding current model metadata (version, metrics).
   - `retrain_logs` — log of retraining runs (status, logs, metrics).

3. Security
   - RLS enabled on every table.
   - `profiles`: owner-scoped CRUD; a trigger auto-creates a profile on signup.
   - `analyses`: owner-scoped CRUD (user sees only their own analyses).
   - `reports`: users can INSERT their own and SELECT their own; admins can SELECT all.
   - `model_info`: readable by all authenticated; only admins can UPDATE.
   - `retrain_logs`: admin-only SELECT; admin-only INSERT.
   - Admin role stored in `profiles.role` ('user' | 'admin'). Policies check admin via
     `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`.

4. Notes
   - `profiles.role` defaults to 'user'. To make a user an admin, set role='admin' in DB.
   - `model_info` seeded with a single row (id=1) on creation.
   - All owner columns default to `auth.uid()` so client inserts omitting them succeed.
*/

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- analyses
CREATE TABLE IF NOT EXISTS public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  prediction text NOT NULL CHECK (prediction IN ('legitimate','phishing')),
  confidence numeric(5,2) NOT NULL,
  risk_score numeric(5,2) NOT NULL,
  probability_legitimate numeric(5,2) NOT NULL,
  probability_phishing numeric(5,2) NOT NULL,
  indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS analyses_user_id_created_idx ON public.analyses(user_id, created_at DESC);

DROP POLICY IF EXISTS "select_own_analyses" ON public.analyses;
CREATE POLICY "select_own_analyses" ON public.analyses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_analyses" ON public.analyses;
CREATE POLICY "insert_own_analyses" ON public.analyses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_analyses" ON public.analyses;
CREATE POLICY "update_own_analyses" ON public.analyses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_analyses" ON public.analyses;
CREATE POLICY "delete_own_analyses" ON public.analyses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- reports
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  original_prediction text NOT NULL CHECK (original_prediction IN ('legitimate','phishing')),
  probability numeric(5,2),
  reason text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified_legitimate','verified_phishing','rejected')),
  verified_label text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS reports_status_created_idx ON public.reports(status, created_at DESC);

-- users can read their own reports
DROP POLICY IF EXISTS "select_own_reports" ON public.reports;
CREATE POLICY "select_own_reports" ON public.reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- users can insert their own reports
DROP POLICY IF EXISTS "insert_own_reports" ON public.reports;
CREATE POLICY "insert_own_reports" ON public.reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- admins can read all reports
DROP POLICY IF EXISTS "admin_select_all_reports" ON public.reports;
CREATE POLICY "admin_select_all_reports" ON public.reports FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- admins can update reports (resolve them)
DROP POLICY IF EXISTS "admin_update_reports" ON public.reports;
CREATE POLICY "admin_update_reports" ON public.reports FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- model_info (single row)
CREATE TABLE IF NOT EXISTS public.model_info (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version text NOT NULL DEFAULT 'v1.0.0',
  num_features int NOT NULL DEFAULT 48,
  training_dataset_size bigint NOT NULL DEFAULT 235370,
  accuracy numeric(5,2) NOT NULL DEFAULT 94.20,
  precision numeric(5,2) NOT NULL DEFAULT 93.80,
  recall numeric(5,2) NOT NULL DEFAULT 95.10,
  f1_score numeric(5,2) NOT NULL DEFAULT 94.44,
  roc_auc numeric(5,2) NOT NULL DEFAULT 97.30,
  training_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','training','failed'))
);
ALTER TABLE public.model_info ENABLE ROW LEVEL SECURITY;

-- readable by all authenticated
DROP POLICY IF EXISTS "authed_select_model_info" ON public.model_info;
CREATE POLICY "authed_select_model_info" ON public.model_info FOR SELECT
  TO authenticated USING (true);

-- admin-only update
DROP POLICY IF EXISTS "admin_update_model_info" ON public.model_info;
CREATE POLICY "admin_update_model_info" ON public.model_info FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- retrain_logs
CREATE TABLE IF NOT EXISTS public.retrain_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  dataset_size bigint,
  approved_reports int,
  progress int NOT NULL DEFAULT 0,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_version text,
  accuracy numeric(5,2),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.retrain_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_retrain_logs" ON public.retrain_logs;
CREATE POLICY "admin_select_retrain_logs" ON public.retrain_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_retrain_logs" ON public.retrain_logs;
CREATE POLICY "admin_insert_retrain_logs" ON public.retrain_logs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_retrain_logs" ON public.retrain_logs;
CREATE POLICY "admin_update_retrain_logs" ON public.retrain_logs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Seed model_info
INSERT INTO public.model_info (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
