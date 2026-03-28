# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run frontend (Vite dev server, port 5173)
npm run dev:web

# Run backend (tsx watch, port 3000)
npm run dev:api

# Build Chrome extension
npm run build:ext

# Lint all workspaces
npm run lint

# Run individual workspace commands
npm run dev --workspace=web
npm run dev --workspace=api
npm run build --workspace=api   # tsc only
```

There are no automated tests in this project.

## Environment Setup

`api/.env` requires:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY2` (note: key name is `OPENAI_API_KEY2`, not `OPENAI_API_KEY`)
- `PORT` (default: 3000)

`web/.env` requires Supabase credentials for the frontend Supabase client.

## Architecture

This is an npm workspaces monorepo with four packages: `web`, `api`, `extension`, `shared`.

### Backend (`api/`)
Express + TypeScript server run via `tsx watch`. Two Supabase clients exist in `lib/supabase.ts`:
- `supabase` — service role client (admin ops only, e.g. `deleteUser`)
- `getAuthClient(token)` — per-request client using the user's JWT so Supabase RLS policies apply

All routes use `requireAuth` middleware (`middleware/auth.ts`) which validates the Bearer token via `supabase.auth.getUser()` and attaches `req.user`.

### Resume Matching Pipeline (`api/src/matcher.ts`)
Four-step hybrid pipeline — designed so LLM calls are minimized and scores are deterministic:
1. `parseJD(jdText, openai)` — GPT-4.1-mini extracts `{ required[], preferred[], yearsExp, jobTitle }` from the JD. Result is cached in `applications.parsed_jd`.
2. `parseResume(text, openai)` — GPT-4.1-mini extracts `{ skills[], yearsExp }`. Result is cached in `resumes.parsed_resume`.
3. `computeHybridScore(resume, jd)` — **pure JS**, no LLM. Scores: required skills (50 pts), preferred skills (30 pts), experience (20 pts, up to -15 penalty). Score is final and locked here.
4. `generateExplanation(...)` — GPT writes narrative text only; the numeric score is passed in and GPT cannot change it.

Match results are cached in a `match_results` table keyed on `(application_id, resume_id, jd_hash)`. The `/match` POST endpoint checks this cache before running the pipeline.

### Frontend (`web/`)
Single-page React app. The main UI is one large component: `JobApplicationTracker.tsx`. It talks directly to the API at `localhost:3000` via axios, passing the Supabase JWT as `Authorization: Bearer <token>`.

Key frontend features: application CRUD, Kanban/list views, analytics charts (recharts), resume upload/management (Files tab), resume-to-job match display (`MatchResult.tsx`), and "Mira" AI career assistant summary.

### Chrome Extension (`extension/`)
Manifest v3 extension. Content script runs on `linkedin.com/jobs/view/*` pages and can send job data to the web app. Popup communicates with `localhost:3001` (note: this is port 3001, not 3000 — the extension hardcodes this; the API runs on 3000).

### Shared (`shared/`)
Exports `ApplicationStatus` union type and `JobImportPayload` interface used across packages.

### Supabase Tables
- `applications` — job applications per user; includes `job_description`, `parsed_jd` (jsonb cache)
- `resumes` — resume metadata + `extracted_text` (plain text from PDF/DOCX) + `parsed_resume` (jsonb cache) + `is_active` flag; max 3 per user
- `profiles` — display name, avatar, theme settings
- `match_results` — cached match outputs keyed on `(application_id, resume_id, jd_hash)`
- Supabase Storage bucket `resumes` — raw files at path `{userId}/{timestamp}_{fileName}`
