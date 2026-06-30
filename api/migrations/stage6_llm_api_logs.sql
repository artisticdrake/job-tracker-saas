-- ════════════════════════════════════════════════════════════════════════════
-- Stage 6 — LLM API call log (request tracker)
-- Apply in the Supabase SQL editor (or via the CLI / MCP) for the project.
-- Additive: a new standalone table, safe to run anytime.
-- ════════════════════════════════════════════════════════════════════════════

-- One row per REAL outbound LLM call (Claude or OpenAI). Cache hits make no call
-- and are intentionally not logged, so this table reflects actual API spend.
-- Written server-side via the SERVICE-ROLE client (bypasses RLS) because the
-- Railway job pipeline (/internal/*, /jobs/scrape) runs with no user JWT — those
-- calls are attributed to INTERNAL_USER_ID (the owner). user_id is nullable so a
-- call with no resolvable user still logs.
create table if not exists public.llm_api_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete set null,
  provider      text not null,        -- 'anthropic' | 'openai'
  model         text not null,        -- e.g. 'claude-sonnet-4-6', 'gpt-4o-mini'
  purpose       text not null,        -- 'tailor' | 'rerank' | 'assemble' | 'cover-letter'
                                       -- | 'score-job' | 'autofill' | 'summary' | 'seed-from-text'
  route         text,                 -- request path when known
  source        text,                 -- 'user' | 'internal' | 'job-pipeline'
  input_tokens  int,
  output_tokens int,
  total_tokens  int,
  cost_usd      numeric(10,6),
  latency_ms    int,
  status        text not null,        -- 'success' | 'error'
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists llm_api_logs_created_idx on public.llm_api_logs (created_at desc);
create index if not exists llm_api_logs_purpose_idx on public.llm_api_logs (purpose);

alter table public.llm_api_logs enable row level security;

-- Owner can read their own rows directly; server-side writes use the service-role
-- client, which bypasses RLS. The GET /llm-logs endpoint reads via service-role so
-- the owner also sees internal/pipeline rows attributed to INTERNAL_USER_ID.
create policy "llm_api_logs_select_own" on public.llm_api_logs
  for select using (auth.uid() = user_id);
