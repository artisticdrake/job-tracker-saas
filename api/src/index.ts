import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase, getAuthClient } from './lib/supabase';
import { requireAuth } from './middleware/auth';
import OpenAI from 'openai';
import { parseJD, parseResume, computeHybridScore, generateExplanation } from './matcher';

dotenv.config({ path: require('path').resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: (process.env.OPENAI_API_KEY2 || '').trim() });

// helper — lazy OpenAI client that always reads the key fresh
function getOpenAI() {
  return new OpenAI({ apiKey: (process.env.OPENAI_API_KEY2 || '').trim() });
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// GET: Fetch all applications for the logged-in user
app.get('/applications', requireAuth, async (req, res) => {
  const userId = (req as any).user.id; 
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .order('last_updated', { ascending: false });

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// POST: Create a new application
app.post('/applications', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const payload = req.body;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('applications')
    .insert([{ ...payload, user_id: userId }])
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, error: error.message });

  // Background: LLM-parse the JD if present — fires after response, zero latency impact
  if (data?.id && payload.job_description?.trim().length > 50) {
    setImmediate(async () => {
      try {
        const parsedJD = await parseJD(payload.job_description, getOpenAI());
        await supabase.from('applications').update({ parsed_jd: parsedJD }).eq('id', data.id);
        console.log(`[matcher] JD parsed (create) app=${data.id}: ${parsedJD.required.length} required, ${parsedJD.preferred.length} preferred`);
      } catch (err: any) {
        console.error('[matcher] Background JD parse failed (create):', err.message);
      }
    });
  }

  res.json({ success: true, data });
});

// PUT: Update an existing application
app.put('/applications/:id', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const payload = req.body;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('applications')
    .update({ ...payload, last_updated: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Application Update Error:', error.message);
    return res.status(400).json({ success: false, error: error.message });
  }

  // Background: re-parse JD if job_description was included in this update
  if (data?.id && payload.job_description?.trim().length > 50) {
    setImmediate(async () => {
      try {
        const parsedJD = await parseJD(payload.job_description, getOpenAI());
        await supabase.from('applications').update({ parsed_jd: parsedJD }).eq('id', data.id);
        console.log(`[matcher] JD parsed (update) app=${data.id}: ${parsedJD.required.length} required, ${parsedJD.preferred.length} preferred`);
      } catch (err: any) {
        console.error('[matcher] Background JD parse failed (update):', err.message);
      }
    });
  }

  console.log('Application updated:', id);
  res.json({ success: true, data });
});

// DELETE: Remove a single application
app.delete('/applications/:id', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { error } = await authClient
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', userId); 

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true });
});

// GET: Fetch user profile
app.get('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('profiles')
    .select('id, theme_settings, display_name, avatar_id, created_at')
    .eq('id', userId)
    .single();

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// PUT: Update user profile
app.put('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { theme_settings, display_name, avatar_id } = req.body;
  const authClient = getAuthClient(req.headers.authorization as string);

  const payload: Record<string, any> = { id: userId };
  if (theme_settings !== undefined) payload.theme_settings = theme_settings;
  if (display_name !== undefined) payload.display_name = display_name;
  if (avatar_id !== undefined) payload.avatar_id = avatar_id;

  const { data, error } = await authClient
    .from('profiles')
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error('Profile Save Error:', error.message);
    return res.status(400).json({ success: false, error: error.message });
  }

  console.log('Profile saved successfully!');
  res.json({ success: true, data });
});

// DELETE: Full account wipe
app.delete('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;

  const { error: appsError } = await supabase
    .from('applications')
    .delete()
    .eq('user_id', userId);

  if (appsError) {
    console.error('Failed to delete applications:', appsError.message);
    return res.status(400).json({ success: false, error: appsError.message });
  }

  // Delete resume files from storage
  const { data: resumeFiles } = await supabase
    .from('resumes')
    .select('storage_path')
    .eq('user_id', userId);

  if (resumeFiles && resumeFiles.length > 0) {
    const paths = resumeFiles.map((r: any) => r.storage_path);
    await supabase.storage.from('resumes').remove(paths);
  }

  // Delete resume rows
  await supabase.from('resumes').delete().eq('user_id', userId);

  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileError) {
    console.error('Failed to delete profile:', profileError.message);
    return res.status(400).json({ success: false, error: profileError.message });
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);

  if (authError) {
    console.error('Failed to delete auth user:', authError.message);
    return res.status(400).json({ success: false, error: authError.message });
  }

  console.log('Account fully deleted for user', userId);
  res.json({ success: true });
});

// ─── RESUMES ────────────────────────────────────────────────────────────────

// GET: List user's resumes
app.get('/resumes', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// POST: Upload a resume (base64 encoded body)
// Body: { fileName: string, fileType: string, fileData: string (base64) }
app.post('/resumes', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { fileName, fileType, fileData, fileSize } = req.body;

  if (!fileName || !fileType || !fileData) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // Enforce 3-resume limit
  const { count } = await supabase
    .from('resumes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) >= 3) {
    return res.status(400).json({ success: false, error: 'Resume limit reached. Delete one to upload a new one.' });
  }

  // Upload to Supabase Storage: resumes/{userId}/{timestamp}_{fileName}
  const storagePath = `${userId}/${Date.now()}_${fileName}`;
  const fileBuffer = Buffer.from(fileData, 'base64');

  const { error: storageError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, fileBuffer, {
      contentType: fileType,
      upsert: false,
    });

  if (storageError) {
    console.error('Storage upload error:', storageError.message);
    return res.status(400).json({ success: false, error: storageError.message });
  }

  // Save metadata to resumes table
  const { data, error: dbError } = await supabase
    .from('resumes')
    .insert([{ user_id: userId, file_name: fileName, storage_path: storagePath, file_size: fileSize ?? 0 }])
    .select()
    .single();

  if (dbError) {
    // Clean up the uploaded file if db insert fails
    await supabase.storage.from('resumes').remove([storagePath]);
    console.error('DB insert error:', dbError.message);
    return res.status(400).json({ success: false, error: dbError.message });
  }

  console.log('Resume uploaded:', storagePath);
  res.json({ success: true, data });
});

// GET: Get a signed download URL for a resume
app.get('/resumes/:id/download', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const authClient = getAuthClient(req.headers.authorization as string);

  // Verify ownership
  const { data: resume, error: fetchError } = await authClient
    .from('resumes')
    .select('storage_path, file_name')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !resume) {
    return res.status(404).json({ success: false, error: 'Resume not found' });
  }

  // Generate a signed URL valid for 60 seconds
  const { data: signedUrl, error: urlError } = await supabase.storage
    .from('resumes')
    .createSignedUrl(resume.storage_path, 60);

  if (urlError) {
    return res.status(400).json({ success: false, error: urlError.message });
  }

  res.json({ success: true, url: signedUrl.signedUrl, fileName: resume.file_name });
});

// DELETE: Delete a resume
app.delete('/resumes/:id', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const authClient = getAuthClient(req.headers.authorization as string);

  // Verify ownership and get storage path
  const { data: resume, error: fetchError } = await authClient
    .from('resumes')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !resume) {
    return res.status(404).json({ success: false, error: 'Resume not found' });
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('resumes')
    .remove([resume.storage_path]);

  if (storageError) {
    console.error('Storage delete error:', storageError.message);
    return res.status(400).json({ success: false, error: storageError.message });
  }

  // Delete from DB
  const { error: dbError } = await authClient
    .from('resumes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) {
    return res.status(400).json({ success: false, error: dbError.message });
  }

  console.log('Resume deleted:', id);
  res.json({ success: true });
});

// ─── RESUME PARSING ──────────────────────────────────────────────────────────

// POST: Parse a resume after upload — extract text, compute hash, set active
// Body: { setActive?: boolean }
app.post('/resumes/:id/parse', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { setActive = false } = req.body;

  // Verify ownership + get storage path
  const { data: resume, error: fetchError } = await supabase
    .from('resumes')
    .select('id, storage_path, file_name')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !resume) {
    return res.status(404).json({ success: false, error: 'Resume not found' });
  }

  try {
    // Download file from Supabase Storage into memory
    const { data: blob, error: downloadError } = await supabase.storage
      .from('resumes')
      .download(resume.storage_path);

    if (downloadError || !blob) {
      return res.status(400).json({ success: false, error: 'Failed to download resume from storage' });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const ext = resume.file_name.split('.').pop()?.toLowerCase();

    // Extract text based on file type
    let rawText = '';

    if (ext === 'pdf') {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: fileBuffer, verbosity: 0 });
      const result = await parser.getText();
      rawText = result.text;
    } else if (ext === 'docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      rawText = result.value;
    } else if (ext === 'doc') {
      // Basic fallback for .doc — extract readable ASCII text
      rawText = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ');
    } else if (ext === 'txt') {
      rawText = fileBuffer.toString('utf-8');
    } else {
      return res.status(400).json({ success: false, error: `Unsupported file type: .${ext}` });
    }

    // Normalize text
    const normalizedText = rawText
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    if (normalizedText.length < 100) {
      return res.status(422).json({
        success: false,
        error: 'Could not extract enough text. Please upload a text-based PDF (not a scanned image).',
      });
    }

    // Compute hash
    const crypto = require('crypto');
    const resumeHash = crypto
      .createHash('sha256')
      .update(normalizedText.toLowerCase())
      .digest('hex')
      .slice(0, 32);

    // If setActive, deactivate all others first
    if (setActive) {
      await supabase
        .from('resumes')
        .update({ is_active: false })
        .eq('user_id', userId);
    }

    // Save extracted text + hash to DB
    const { data: updated, error: updateError } = await supabase
      .from('resumes')
      .update({
        extracted_text: normalizedText,
        resume_hash: resumeHash,
        ...(setActive ? { is_active: true } : {}),
      })
      .eq('id', id)
      .select('id, file_name, resume_hash, is_active, uploaded_at, file_size')
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, error: updateError.message });
    }

    // Background: LLM-extract structured skills + experience from resume text
    // Stored in parsed_resume jsonb column — used by hybrid match scorer
    setImmediate(async () => {
      try {
        const parsedResume = await parseResume(normalizedText, getOpenAI());
        await supabase.from('resumes').update({ parsed_resume: parsedResume }).eq('id', id);
        console.log(`[matcher] Resume skills parsed: ${id} | ${parsedResume.skills.length} skills | ${parsedResume.yearsExp ?? '?'} yrs exp`);
      } catch (err: any) {
        console.error('[matcher] Background resume parse failed:', err.message);
      }
    });

    console.log(`Resume parsed: ${id} | ${normalizedText.length} chars | hash: ${resumeHash}`);
    res.json({
      success: true,
      data: updated,
      charCount: normalizedText.length,
      wordCount: normalizedText.split(/\s+/).filter(Boolean).length,
    });
  } catch (err: any) {
    console.error('Parse error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH: Set a resume as active
app.patch('/resumes/:id/active', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  // Verify ownership
  const { data: resume } = await supabase
    .from('resumes')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!resume) return res.status(404).json({ success: false, error: 'Resume not found' });

  // Deactivate all, then activate this one
  await supabase.from('resumes').update({ is_active: false }).eq('user_id', userId);
  await supabase.from('resumes').update({ is_active: true }).eq('id', id);

  res.json({ success: true });
});

// ─── MATCHING (Hybrid Pipeline) ───────────────────────────────────────────────
// Replaces the old hardcoded TECH_SKILLS keyword matching.
// matcher.ts handles: LLM JD parsing, LLM resume parsing, pure-JS scoring, GPT narrative.
// JD is pre-parsed on application save (see POST/PUT /applications above).
// Resume is pre-parsed on parse button click (see POST /resumes/:id/parse above).

// POST: Run match (or return cached result)
// Body: { applicationId: string, jdText?: string, resumeId?: string }
// jdText is optional — if omitted, uses the application's stored job_description
app.post('/match', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { applicationId, jdText: bodyJD, resumeId } = req.body;

  if (!applicationId) return res.status(400).json({ success: false, error: 'applicationId is required' });

  // Fetch application — get stored JD text + pre-parsed JD if available
  const { data: appRow } = await supabase
    .from('applications')
    .select('id, job_description, parsed_jd')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .single();

  if (!appRow) return res.status(404).json({ success: false, error: 'Application not found' });

  // Resolve JD text — body takes priority (user pasted fresh), else use stored JD
  const jdText = (bodyJD?.trim().length > 50 ? bodyJD : appRow.job_description) || '';
  if (jdText.trim().length < 50) {
    return res.status(400).json({ success: false, error: 'No job description found. Add a JD to this application first.', code: 'NO_JD' });
  }

  // Resolve resume — use specified or active one, fetching parsed_resume too
  let resumeQuery = supabase
    .from('resumes')
    .select('id, extracted_text, resume_hash, file_name, parsed_resume')
    .eq('user_id', userId);

  resumeQuery = resumeId
    ? resumeQuery.eq('id', resumeId)
    : resumeQuery.eq('is_active', true);

  const { data: resume } = await resumeQuery.single();

  if (!resume) {
    return res.status(404).json({ success: false, error: 'No resume found. Upload and parse a resume first.', code: 'NO_RESUME' });
  }
  if (!resume.extracted_text) {
    return res.status(422).json({ success: false, error: 'Resume not parsed yet. Go to Files → click Parse on your resume.', code: 'NOT_PARSED' });
  }

  // Normalize JD + compute cache key
  const crypto = require('crypto');
  const jdNorm = jdText.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  const jdHash = crypto.createHash('sha256').update(jdNorm.toLowerCase()).digest('hex').slice(0, 32);

  // Check cache — same app + same resume + same JD = return cached result immediately
  const { data: cached } = await supabase
    .from('match_results')
    .select('*')
    .eq('application_id', applicationId)
    .eq('resume_id', resume.id)
    .eq('jd_hash', jdHash)
    .maybeSingle();

  if (cached) {
    return res.json({ success: true, data: cached, fromCache: true });
  }

  // ── Hybrid Pipeline: get structured data ──
  // Use pre-parsed versions if cached on the DB rows (fast, no LLM call)
  // Fall back to live LLM parse if not yet available
  const openai = getOpenAI();

  const [parsedJD, parsedResume] = await Promise.all([
    appRow.parsed_jd && appRow.parsed_jd.required
      ? Promise.resolve(appRow.parsed_jd)
      : parseJD(jdNorm, openai),
    resume.parsed_resume && resume.parsed_resume.skills
      ? Promise.resolve(resume.parsed_resume)
      : parseResume(resume.extracted_text, openai),
  ]);

  // ── Pure JS scoring — zero LLM calls ──
  const matchResult = computeHybridScore(parsedResume, parsedJD);
  const { score, breakdown, matchedRequired, missingRequired, matchedPreferred, missingPreferred } = matchResult;

  // ── GPT writes the narrative only ──
  const explanation = await generateExplanation(
    score,
    breakdown,
    matchedRequired,
    missingRequired,
    matchedPreferred,
    resume.extracted_text,
    jdNorm,
    openai
  );

  // Persist any freshly-computed parsed data back to DB so next match is faster
  if (!appRow.parsed_jd?.required) {
    supabase.from('applications').update({ parsed_jd: parsedJD }).eq('id', applicationId).then(() =>
      console.log(`[matcher] Cached parsedJD for app ${applicationId}`)
    );
  }
  if (!resume.parsed_resume?.skills) {
    supabase.from('resumes').update({ parsed_resume: parsedResume }).eq('id', resume.id).then(() =>
      console.log(`[matcher] Cached parsedResume for resume ${resume.id}`)
    );
  }

  // Save full result to match_results
  const { data: saved, error: saveErr } = await supabase
    .from('match_results')
    .upsert({
      application_id: applicationId,
      user_id: userId,
      resume_id: resume.id,
      resume_hash: resume.resume_hash,
      jd_hash: jdHash,
      score,
      score_breakdown: breakdown,
      matched_skills: matchedRequired,       // required skills matched (primary display)
      missing_skills: missingRequired,       // required skills missing (primary display)
      explanation: {
        ...explanation,
        matchedPreferred,                    // bonus: preferred skills matched
        missingPreferred,                    // bonus: preferred skills missing
        parsedJDTitle: parsedJD.jobTitle,
        yearsRequired: parsedJD.yearsExp,
        yearsDetected: parsedResume.yearsExp,
      },
      matched_at: new Date().toISOString(),
    }, { onConflict: 'application_id,resume_id,jd_hash' })
    .select()
    .single();

  if (saveErr) console.error('Failed to save match result:', saveErr.message);

  // Backfill JD text on application row if it was empty
  if (!appRow.job_description) {
    await supabase.from('applications').update({ job_description: jdNorm }).eq('id', applicationId);
  }

  console.log(`[matcher] Match complete: app=${applicationId} score=${score} required=${matchedRequired.length}/${parsedJD.required.length}`);
  res.json({ success: true, data: saved, fromCache: false, resumeLabel: resume.file_name });
});

// GET: Fetch most recent match result for an application
app.get('/match/:appId', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { appId } = req.params;

  const { data, error } = await supabase
    .from('match_results')
    .select('*')
    .eq('application_id', appId)
    .eq('user_id', userId)
    .order('matched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(400).json({ success: false, error: error.message });
  if (!data) return res.status(404).json({ success: false, error: 'No match result found' });

  res.json({ success: true, data });
});

// DELETE: Clear cached match for an application (forces recompute on next POST /match)
app.delete('/match/:appId', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { appId } = req.params;

  await supabase.from('match_results').delete().eq('application_id', appId).eq('user_id', userId);
  res.json({ success: true, message: 'Match cache cleared.' });
});

// ─── Autofill ────────────────────────────────────────────────────────────────
// POST /autofill
// Body: { url: string }
// Returns: { company, position, location, salary, jobDescription, source }
// Used by: Add Application form + Chrome extension
app.post('/autofill', requireAuth, async (req, res) => {
  const { url } = req.body;

  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'A valid URL is required.' });
  }

  // 1. Fetch the page
  let rawHtml = '';
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rawHtml = await response.text();
  } catch (err: any) {
    return res.status(422).json({ success: false, error: `Could not fetch the URL: ${err.message}` });
  }

  // 2. Strip HTML to readable text
  const pageText = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 12000); // keep within GPT context

  // 3. GPT-4o extraction
  const prompt = `You are a job posting parser. Extract structured data from the page text below.

Return ONLY valid JSON with exactly these fields (use null if not found):
{
  "company": "Company name (the hiring company, not the job board)",
  "position": "Job title / position",
  "location": "City, State or Remote",
  "salary": "Salary or pay range if mentioned, else null",
  "jobDescription": "Find the section titled 'Job Description', 'About the Job', 'About this role', 'Responsibilities', or similar — then copy its FULL text exactly as it appears. Do NOT summarize, shorten, or paraphrase. Include all sections: requirements, responsibilities, nice-to-haves, benefits, day-to-day, etc. Preserve all bullet points and formatting as plain text."
}

PAGE TEXT:
${pageText}`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 3000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.choices[0].message.content?.trim() || '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(clean);

    return res.json({ success: true, data: parsed });
  } catch (err: any) {
    console.error('AUTOFILL ERROR FULL:', JSON.stringify(err?.response?.data || err?.error || err?.message || err, null, 2));
    return res.status(500).json({ success: false, error: `Extraction failed: ${err?.response?.data?.error?.message || err?.error?.message || err.message}` });
  }
});

// ─── Mira AI Summary ─────────────────────────────────────────────────────────
// POST /summary
// Body: { apps: Application[] }
// Returns: { summary: string, hasResume: boolean }
app.post('/summary', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { apps } = req.body;

  if (!Array.isArray(apps) || apps.length === 0) {
    return res.status(400).json({ success: false, error: 'No applications provided.' });
  }

  // Fetch active resume server-side
  const { data: resume } = await supabase
    .from('resumes')
    .select('file_name, extracted_text')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  // Build stats
  const total = apps.length;
  const now = new Date();
  const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
  const thisWeek = apps.filter((a: any) => new Date(a.dateApplied) >= weekAgo).length;

  const statusCounts: Record<string, number> = {
    Applied: 0, Screening: 0, 'Interview Scheduled': 0,
    'Interview Completed': 0, Offer: 0, Rejected: 0, Withdrawn: 0,
  };
  apps.forEach((a: any) => {
    if (statusCounts[a.status] !== undefined) statusCounts[a.status]++;
  });
  const interviews = (statusCounts['Interview Scheduled'] || 0) + (statusCounts['Interview Completed'] || 0);

  // Build per-application context with JD snippets
  const appDetails = apps
    .slice(0, 20)
    .map((a: any) => {
      const jd = a.jobDescription ? `\n   JD Snippet: ${a.jobDescription.slice(0, 400)}` : '';
      return `- ${a.company} | ${a.position} | ${a.status} | Applied: ${a.dateApplied}${jd}`;
    })
    .join('\n');

  const resumeSection = resume?.extracted_text
    ? `\nACTIVE RESUME (${resume.file_name}):\n${resume.extracted_text.slice(0, 3000)}`
    : '\nACTIVE RESUME: None uploaded or parsed yet. Call this out.';

  const prompt = `You are Mira, an empathetic but grounded AI career assistant. Analyze this person's job search honestly.

Guidelines:
- Be warm and supportive in tone, but never sugarcoat the reality
- Acknowledge genuine progress and effort where it exists
- Be direct about what isn't working without being harsh
- If weekly application rate is below 15, flag it clearly but constructively
- Speak directly to the user in second person
- Offer one or two concrete, actionable observations — not generic advice
- If resume is provided, identify specific skill gaps or positioning mismatches relative to the roles they are applying to
- If no resume is uploaded, point that out as something to address
- Plain sentences only, no bullet points or formatting
- 6-10 lines total

APPLICATIONS (${total} total, ${thisWeek} this week):
${appDetails}

STATS:
Screening: ${statusCounts['Screening']} | Interviews: ${interviews} | Offers: ${statusCounts['Offer']} | Rejected: ${statusCounts['Rejected']}
${resumeSection}`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are Mira, a warm and empathetic AI career assistant who gives honest, grounded feedback. You are encouraging but never dishonest. You speak plainly, avoid bullet points, and never use em dashes.' },
        { role: 'user', content: prompt },
      ],
    });

    const summary = response.choices[0].message.content?.trim() || '';
    return res.json({ success: true, summary, hasResume: !!resume?.extracted_text });
  } catch (err: any) {
    console.error('Mira summary error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});