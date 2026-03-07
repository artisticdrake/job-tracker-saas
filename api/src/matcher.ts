/**
 * matcher.ts — Hybrid Extraction Pipeline
 *
 * Architecture:
 *   1. parseJD(jdText)       → LLM extracts structured JD data (run once per JD, cache result)
 *   2. parseResume(text)     → LLM extracts structured resume data (run once per upload)
 *   3. computeHybridScore()  → Pure JS comparison of the two JSON objects
 *   4. generateExplanation() → GPT writes narrative from the already-computed score
 *
 * Drop-in for the current index.ts match section.
 * Import: import { parseJD, parseResume, computeHybridScore, generateExplanation } from './matcher'
 */

import OpenAI from 'openai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedJD {
  required: string[];       // Must-have skills/techs
  preferred: string[];      // Nice-to-have skills/techs
  yearsExp: number | null;  // Required years of experience
  jobTitle: string;         // Extracted job title
}

export interface ParsedResume {
  skills: string[];         // All skills/techs found
  yearsExp: number | null;  // Calculated total years of experience
}

export interface ScoreBreakdown {
  requiredScore: number;    // 0–50: required skills matched
  preferredScore: number;   // 0–30: preferred skills matched
  experienceScore: number;  // 0–20: experience match
  experiencePenalty: number;// 0 to -15: penalty if under-qualified
}

export interface MatchResult {
  score: number;                  // 0–100 final
  breakdown: ScoreBreakdown;
  matchedRequired: string[];      // Required skills found in resume
  missingRequired: string[];      // Required skills NOT in resume
  matchedPreferred: string[];     // Preferred skills found in resume
  missingPreferred: string[];     // Preferred skills NOT in resume
}

export interface Explanation {
  summary: string;
  bulletPoints: string[];
  resumeRewrites: { original: string; rewritten: string }[];
  actionSteps: string[];
}

// ─── Step 1: Parse JD ─────────────────────────────────────────────────────────

/**
 * Sends the raw JD text to GPT-4o-mini.
 * Returns structured JSON: required skills, preferred skills, years of exp, job title.
 * Call this once when a user saves/updates a job — cache result on the application row.
 */
export async function parseJD(jdText: string, openai: OpenAI): Promise<ParsedJD> {
  const prompt = `You are a technical recruiter parsing a job description.

Extract the following from this job description and return ONLY valid JSON, no markdown, no explanation:

{
  "jobTitle": "exact job title from the posting",
  "required": ["skill1", "skill2"],
  "preferred": ["skill3", "skill4"],
  "yearsExp": 3
}

Rules:
- Extract BOTH specific tools AND broad domain terms:
  * "experience with machine learning" → include "machine learning"
  * "deep learning frameworks" → include "deep learning" AND specific frameworks mentioned
  * "data visualization tools" → include "data visualization"
  * "NLP or text processing" → include "nlp" AND "natural language processing"
  * "statistical modeling" → include "statistical modeling"
  * "computer vision" → include "computer vision"
  * "data analysis" → include "data analysis"
  * "data science background" → include "data science"
  * "data engineering" → include "data engineering"
- "required": skills/technologies that are EXPLICITLY required (look for: "required", "must have", "minimum", "qualifications", "you will need")
- "preferred": skills/technologies that are desired but not mandatory (look for: "preferred", "nice to have", "bonus", "plus", "ideally")
- If a skill appears in both sections, put it ONLY in "required"
- "yearsExp": the MINIMUM years of experience required as an integer, or null if not specified
- All skills lowercase. Include up to 20 required and 15 preferred.
- If you cannot distinguish required from preferred, put everything in "required"

JOB DESCRIPTION:
${jdText.slice(0, 4000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 600,
      temperature: 0.1, // Low temp for structured extraction
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.choices[0].message.content?.trim() || '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(clean);

    return {
      jobTitle: (parsed.jobTitle || '').trim(),
      required: Array.isArray(parsed.required) ? parsed.required.map((s: string) => s.toLowerCase().trim()) : [],
      preferred: Array.isArray(parsed.preferred) ? parsed.preferred.map((s: string) => s.toLowerCase().trim()) : [],
      yearsExp: typeof parsed.yearsExp === 'number' ? parsed.yearsExp : null,
    };
  } catch (err: any) {
    console.error('[matcher] parseJD failed:', err.message);
    // Graceful fallback — return empty structure so match can still proceed
    return { jobTitle: '', required: [], preferred: [], yearsExp: null };
  }
}

// ─── Step 2: Parse Resume ─────────────────────────────────────────────────────

/**
 * Sends extracted resume text to GPT-4o-mini.
 * Returns structured JSON: all skills found + calculated years of experience.
 * Call this once when a user hits "Parse" on a resume — cache result on the resume row.
 *
 * NOTE: The existing /resumes/:id/parse endpoint already extracts plain text from PDF/DOCX.
 * This function is the NEW second step: LLM-parse that extracted text into structured data.
 * Store the result in a new column `parsed_data jsonb` on the resumes table.
 */
export async function parseResume(resumeText: string, openai: OpenAI): Promise<ParsedResume> {
  const prompt = `You are a technical recruiter parsing a resume.

Extract the following and return ONLY valid JSON, no markdown, no explanation:

{
  "skills": ["skill1", "skill2", "skill3"],
  "yearsExp": 3
}

Rules:
- "skills": Extract TWO types of terms — specific tools AND broad domain categories:
  TYPE 1 - Specific tools/libraries (always include): "pytorch", "tensorflow", "scikit-learn", "opencv", "pandas", "react", "docker", "aws", etc.
  TYPE 2 - Domain/category terms (ALWAYS include these if the resume implies them):
    * If resume mentions PyTorch, TensorFlow, Keras, neural networks → add "deep learning"
    * If resume mentions scikit-learn, XGBoost, Random Forest, ML models → add "machine learning"
    * If resume mentions OpenCV, YOLO, image processing, computer vision → add "computer vision"
    * If resume mentions NLTK, spaCy, HuggingFace, LangChain, text processing → add "nlp" AND "natural language processing"
    * If resume mentions pandas, numpy, matplotlib, data analysis tasks → add "data analysis" AND "data visualization"
    * If resume mentions pipelines, ETL, data workflows → add "data engineering"
    * If resume explicitly lists "Data Science", "Machine Learning", "Deep Learning" as a skill → ALWAYS include it verbatim
    * If resume mentions statistical analysis, regression, modeling → add "statistical modeling" AND "statistics"
  Include up to 60 skills total. Lowercase everything.
- "yearsExp": Calculate total professional experience in years from work history dates. Student with internships counts. Return as integer or null if not determinable.
- Do NOT include soft skills, company names, or job titles

RESUME TEXT:
${resumeText.slice(0, 4000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 500,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.choices[0].message.content?.trim() || '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(clean);

    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.map((s: string) => s.toLowerCase().trim()) : [],
      yearsExp: typeof parsed.yearsExp === 'number' ? parsed.yearsExp : null,
    };
  } catch (err: any) {
    console.error('[matcher] parseResume failed:', err.message);
    return { skills: [], yearsExp: null };
  }
}

// ─── Step 3: Pure JS Score Computation ───────────────────────────────────────

/**
 * No LLM calls. Pure JavaScript set comparison.
 * Takes the two parsed JSON objects and returns a deterministic score.
 *
 * Scoring weights:
 *   Required skills:   50 pts  (most important — "can you do the job?")
 *   Preferred skills:  30 pts  (differentiator — "are you a great fit?")
 *   Experience:        20 pts  (baseline qualifier)
 *   Experience penalty: -15    (if significantly under-qualified)
 */
export function computeHybridScore(resume: ParsedResume, jd: ParsedJD): MatchResult {
  const resumeSkillSet = new Set(resume.skills);

  // ── Required skills (50 pts) ──
  const matchedRequired = jd.required.filter(s => resumeSkillSet.has(s));
  const missingRequired = jd.required.filter(s => !resumeSkillSet.has(s));

  const requiredScore = jd.required.length === 0
    ? 35  // No required skills listed — give partial credit (not a perfect 50, since we can't verify)
    : Math.round((matchedRequired.length / jd.required.length) * 50);

  // ── Preferred skills (30 pts) ──
  const matchedPreferred = jd.preferred.filter(s => resumeSkillSet.has(s));
  const missingPreferred = jd.preferred.filter(s => !resumeSkillSet.has(s));

  const preferredScore = jd.preferred.length === 0
    ? 15  // No preferred skills listed — give partial credit
    : Math.round((matchedPreferred.length / jd.preferred.length) * 30);

  // ── Experience (20 pts + penalty) ──
  let experienceScore = 10; // Default: neutral if neither side has data
  let experiencePenalty = 0;

  if (jd.yearsExp !== null && resume.yearsExp !== null) {
    const gap = jd.yearsExp - resume.yearsExp;

    if (gap <= 0) {
      // Meets or exceeds requirement
      experienceScore = 20;
    } else if (gap <= 1) {
      // 1 year short — close enough
      experienceScore = 15;
      experiencePenalty = -5;
    } else if (gap <= 2) {
      // 2 years short — notable gap
      experienceScore = 8;
      experiencePenalty = -10;
    } else {
      // 3+ years short — significant gap
      experienceScore = 3;
      experiencePenalty = -15;
    }
  } else if (jd.yearsExp === null) {
    // No requirement stated — full experience score
    experienceScore = 20;
  }

  const rawTotal = requiredScore + preferredScore + experienceScore + experiencePenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawTotal)));

  return {
    score,
    breakdown: {
      requiredScore,
      preferredScore,
      experienceScore,
      experiencePenalty,
    },
    matchedRequired,
    missingRequired,
    matchedPreferred,
    missingPreferred,
  };
}

// ─── Step 4: GPT Explanation ──────────────────────────────────────────────────

/**
 * GPT-4o-mini writes the narrative explanation.
 * Critically: the score is already computed and LOCKED. GPT only writes human-friendly text.
 * This prevents GPT from "disagreeing" with the score or hallucinating a different number.
 */
export async function generateExplanation(
  score: number,
  breakdown: ScoreBreakdown,
  matchedRequired: string[],
  missingRequired: string[],
  matchedPreferred: string[],
  resumeSnippet: string,
  jdSnippet: string,
  openai: OpenAI
): Promise<Explanation> {
  const prompt = `You are a career coach reviewing a resume against a job description.

MATCH SCORE: ${score}/100 (FINAL — do not suggest a different number)

SCORE BREAKDOWN:
- Required skills matched: ${breakdown.requiredScore}/50
- Preferred skills matched: ${breakdown.preferredScore}/30
- Experience score: ${breakdown.experienceScore}/20
- Experience penalty: ${breakdown.experiencePenalty}

MATCHED REQUIRED: ${matchedRequired.slice(0, 10).join(', ') || 'none'}
MISSING REQUIRED: ${missingRequired.slice(0, 8).join(', ') || 'none'}
MATCHED PREFERRED: ${matchedPreferred.slice(0, 8).join(', ') || 'none'}

RESUME (first 1200 chars):
${resumeSnippet.slice(0, 1200)}

JOB DESCRIPTION (first 1200 chars):
${jdSnippet.slice(0, 1200)}

Respond ONLY with valid JSON, no markdown:
{
  "summary": "2-3 sentence honest, warm assessment of this candidate's fit for this specific role",
  "bulletPoints": ["specific observation 1", "observation 2", "observation 3"],
  "resumeRewrites": [
    { "original": "approximate existing bullet from resume", "rewritten": "stronger version tailored to this JD" },
    { "original": "...", "rewritten": "..." }
  ],
  "actionSteps": ["specific action step 1", "action step 2", "action step 3", "action step 4"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 1000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.choices[0].message.content?.trim() || '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(clean);
  } catch (err: any) {
    console.error('[matcher] generateExplanation failed:', err.message);
    // Graceful fallback
    return {
      summary: `This resume scores ${score}/100 for this role. ${score >= 70 ? 'Strong alignment detected.' : score >= 50 ? 'Partial fit — some gaps exist.' : 'Significant skill gaps detected.'}`,
      bulletPoints: [
        matchedRequired.length > 0 ? `Matched required skills: ${matchedRequired.slice(0, 5).join(', ')}` : 'No required skills matched from the list.',
        missingRequired.length > 0 ? `Missing required skills: ${missingRequired.slice(0, 5).join(', ')}` : 'All required skills accounted for.',
        'AI narrative unavailable — check OPENAI_API_KEY2.',
      ],
      resumeRewrites: [],
      actionSteps: missingRequired.length > 0
        ? [`Consider adding experience with: ${missingRequired.slice(0, 3).join(', ')}`]
        : ['Your skills closely match the requirements.'],
    };
  }
}

// ─── Convenience: Full Pipeline ───────────────────────────────────────────────

/**
 * Runs the full hybrid pipeline end-to-end.
 * Use this when you don't have pre-parsed JD/resume data cached yet.
 *
 * In production, you'd cache parsedJD on the application row and
 * parsedResume on the resume row — this is the "parse once" version.
 */
export async function runFullMatch(
  resumeText: string,
  jdText: string,
  openai: OpenAI,
  options?: {
    cachedParsedJD?: ParsedJD;
    cachedParsedResume?: ParsedResume;
  }
): Promise<{
  parsedJD: ParsedJD;
  parsedResume: ParsedResume;
  matchResult: MatchResult;
  explanation: Explanation;
}> {
  // Use cached versions if available (avoids re-parsing)
  const [parsedJD, parsedResume] = await Promise.all([
    options?.cachedParsedJD ?? parseJD(jdText, openai),
    options?.cachedParsedResume ?? parseResume(resumeText, openai),
  ]);

  // Pure JS — no LLM call
  const matchResult = computeHybridScore(parsedResume, parsedJD);

  // GPT narrative only
  const explanation = await generateExplanation(
    matchResult.score,
    matchResult.breakdown,
    matchResult.matchedRequired,
    matchResult.missingRequired,
    matchResult.matchedPreferred,
    resumeText,
    jdText,
    openai
  );

  return { parsedJD, parsedResume, matchResult, explanation };
}