-- ════════════════════════════════════════════════════════════════════════════
-- Stage 7 — Link a resume_builder version to the application it was tailored for
-- Apply in the Supabase SQL editor (or via the CLI) for the project.
-- ════════════════════════════════════════════════════════════════════════════

-- Mirrors cover_letters.application_id: set when the Tailor tab has a
-- linkedAppId in scope at "Send to Builder" time. Nullable — /jobs/:id/generate
-- and ad-hoc versions created directly in the Builder have no application.
alter table public.resume_builder
  add column if not exists application_id uuid references public.applications (id) on delete set null;

create index if not exists resume_builder_app_idx on public.resume_builder (application_id);

-- RLS: no change needed. The existing "Users can only access their own
-- resumes" policy (cmd=ALL, qual=auth.uid() = user_id) is keyed only on
-- user_id, so it already covers the new column for every operation — the same
-- reasoning stage2 used when it added job_description/jd_hash to this table.
