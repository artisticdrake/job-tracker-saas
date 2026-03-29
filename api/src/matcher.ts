/**
 * matcher.ts — Pure-JS Hybrid Matching Pipeline (v2)
 *
 * Architecture:
 *   1. parseJD(jdText)        → Pure JS, no LLM. Regex + skill dictionary.
 *   2. parseResume(text)      → Pure JS, no LLM. Section-aware skill extraction.
 *   3. computeHybridScore()   → Weighted 5-component scorer (100 pts total).
 *   4. generateExplanation()  → GPT-4o-mini writes narrative from locked score.
 */

import OpenAI from 'openai';
import {
  scanText,
  applyImpliedSkills,
  deduplicateImplied,
  getWeight,
} from './lib/skillDictionary';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedJD {
  jobTitle: string;
  requiredSkills: string[];
  preferredSkills: string[];
  yearsRequired: number | null;
  educationRequired: 'high_school' | 'bachelors' | 'masters' | 'phd' | null;
  gatekeepers: string[];
  sectionSplitWorked: boolean;
}

export interface ParsedResume {
  skills: string[];
  skillsInContext: string[];    // proven in experience/project bullets
  skillsListOnly: string[];     // only in skills section (weaker evidence)
  yearsExperience: number | null;
  educationLevel: 'high_school' | 'bachelors' | 'masters' | 'phd' | null;
}

export interface ScoreBreakdown {
  requiredScore: number;    // 0–45 (or 0–32 when dynamic)
  depthScore: number;       // 0–20
  preferredScore: number;   // 0–15 (or 0–28 when dynamic)
  experienceScore: number;  // 0–12
  educationScore: number;   // 0–8
}

export interface MatchResult {
  score: number;
  label: 'Excellent' | 'Strong' | 'Good' | 'Partial' | 'Weak';
  breakdown: ScoreBreakdown;
  matchedRequired: string[];
  missingRequired: string[];
  matchedPreferred: string[];
  missingPreferred: string[];
  gatekeepers: string[];
}

export interface Explanation {
  summary: string;
  bulletPoints: string[];
  resumeRewrites: { original: string; rewritten: string }[];
  actionSteps: string[];
}

// ─── JD Parser ────────────────────────────────────────────────────────────────

const REQUIRED_HEADINGS = [
  /\brequired\s*(qualifications?|skills?|experience|knowledge)?\s*[:\-]?\s*$/i,
  /\bmust[\s-]have\b/i,
  /\bminimum\s*(qualifications?|requirements?|experience)\b/i,
  /\bbasic\s*qualifications?\b/i,
  /\bwhat\s+you('ll)?\s+(need|bring|have)\b/i,
  /\byou\s+(must|will)\s+(have|need)\b/i,
  /\bqualifications?\s*[:\-]\s*$/i,
  /^knowledge\s+and\s+experience\s*[:\-]?\s*$/i,
  /\btechnical\s+skills?\s*[:\-]\s*$/i,
  /\bcore\s+requirements?\s*[:\-]?\s*$/i,
  /\bposition\s+requirements?\s*[:\-]?\s*$/i,
  /\byour\s+(background|qualifications?|skills?|experience)\s*[:\-]?\s*$/i,
  /\bwho\s+you\s+are\b/i,
  /\bwhat\s+we('re|\s+are)\s+looking\s+for\b/i,
  /\bjob\s+requirements?\s*[:\-]?\s*$/i,
];

const PREFERRED_HEADINGS = [
  /\bpreferred\b/i,
  /\bnice[\s-]to[\s-]have\b/i,
  /\bbonus\s*(points?)?\b/i,
  /\bdesired\b/i,
  /\bideal\s*(candidate|qualifications?)?\b/i,
  /\badditional\s*(knowledge|experience|qualifications?|skills?)\b/i,
  /\bwould\s+be\s+(a\s+)?(plus|great|nice|bonus)\b/i,
];

const GATEKEEPER_PATTERNS = [
  { pattern: /citizenship|authorized to work|work authorization|eligible to work|right to work/i, label: 'Work authorization / citizenship required' },
  { pattern: /security clearance|secret clearance|top secret|ts\/sci/i,                           label: 'Security clearance required' },
  { pattern: /must be.{0,30}(us|u\.s\.)\s*(citizen|national|resident)/i,                         label: 'US citizenship required' },
  { pattern: /drug (test|screen|screening)/i,                                                      label: 'Drug screening required' },
  { pattern: /background check|criminal (history|background)/i,                                   label: 'Background check required' },
  { pattern: /on[\s-]?site|in[\s-]?office|in[\s-]person/i,                                       label: 'On-site / location requirement' },
  { pattern: /years?\s+(of\s+)?(us|u\.s\.)\s+residen/i,                                          label: 'US residency requirement' },
];

const SKIP_TITLE_PATTERNS = [
  /^(principal|key|core)\s+accountabilit/i,
  /^(knowledge|experience|education|supervision|overview|about|summary|responsibilities|requirements)/i,
  /^(job\s+)?description$/i,
  /^position\s+(overview|summary|details)$/i,
];

const MAX_REQUIRED_FALLBACK = 12;

function splitJDSections(text: string): { required: string; preferred: string; worked: boolean } {
  const lines = text.split('\n');
  const sections: { type: 'required' | 'preferred' | 'other'; lines: string[] }[] = [];
  let currentType: 'required' | 'preferred' | 'other' = 'other';
  let currentLines: string[] = [];
  let foundAny = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isReq  = REQUIRED_HEADINGS.some(p => p.test(trimmed))  && trimmed.length < 80;
    const isPref = PREFERRED_HEADINGS.some(p => p.test(trimmed)) && trimmed.length < 80;

    if (isReq) {
      if (currentLines.length) sections.push({ type: currentType, lines: currentLines });
      currentType = 'required'; currentLines = []; foundAny = true;
    } else if (isPref) {
      if (currentLines.length) sections.push({ type: currentType, lines: currentLines });
      currentType = 'preferred'; currentLines = []; foundAny = true;
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length) sections.push({ type: currentType, lines: currentLines });

  return {
    required: sections.filter(s => s.type === 'required').map(s => s.lines.join('\n')).join('\n').trim(),
    preferred: sections.filter(s => s.type === 'preferred').map(s => s.lines.join('\n')).join('\n').trim(),
    worked: foundAny,
  };
}

function extractYearsRequired(text: string): number | null {
  const patterns = [
    /(\d+)\+?\s*(?:or more\s+)?years?\s+of\s+(?:relevant\s+|related\s+|professional\s+)?experience/gi,
    /(\d+)\+?\s*years?\s+experience/gi,
    /minimum\s+(?:of\s+)?(\d+)\s*years?/gi,
    /at\s+least\s+(\d+)\s*years?/gi,
  ];
  let min: number | null = null;
  for (const p of patterns) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      const v = parseInt(m[1], 10);
      if (!isNaN(v) && v <= 20 && (min === null || v < min)) min = v;
    }
  }
  return min;
}

function extractEducationRequired(text: string): ParsedJD['educationRequired'] {
  const lower = text.toLowerCase();
  if (/\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/.test(lower)) return 'phd';
  if (/\bmaster'?s?\b|\bm\.s\.?\b|\bm\.eng\b|\bmba\b/.test(lower)) return 'masters';
  if (/\bbachelor'?s?\b|\bb\.s\.?\b|\bb\.a\.?\b|\bundergraduate\b/.test(lower)) return 'bachelors';
  if (/\bhigh school\b|\bged\b/.test(lower)) return 'high_school';
  return null;
}

function extractJobTitle(text: string): string {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (
      t.length > 3 &&
      t.length < 80 &&
      !t.includes('.') &&
      !/^(as a|we are|about|our|the company)/i.test(t) &&
      !SKIP_TITLE_PATTERNS.some(p => p.test(t))
    ) return t;
  }
  return '';
}

export function parseJD(jdText: string): ParsedJD {
  const { required: reqSection, preferred: prefSection, worked } = splitJDSections(jdText);

  let requiredRaw: Set<string>;
  let preferredRaw: Set<string>;

  if (worked) {
    requiredRaw  = applyImpliedSkills(scanText(reqSection || jdText));
    preferredRaw = applyImpliedSkills(scanText(prefSection));
  } else {
    const allFound = applyImpliedSkills(scanText(jdText));
    const ranked   = [...allFound].sort((a, b) => getWeight(b) - getWeight(a));
    requiredRaw    = new Set(ranked.slice(0, MAX_REQUIRED_FALLBACK));
    preferredRaw   = new Set(ranked.slice(MAX_REQUIRED_FALLBACK));
  }

  const requiredDeduped  = deduplicateImplied(requiredRaw);
  const preferredDeduped = deduplicateImplied(preferredRaw);

  // Core-skill promotion: if required < 8 skills but preferred has weight=3 skills,
  // promote them — they are gate skills regardless of where the JD author placed them.
  if (requiredDeduped.size < 8 && preferredDeduped.size > 0) {
    for (const skill of [...preferredDeduped]) {
      if (getWeight(skill) === 3) {
        requiredDeduped.add(skill);
        preferredDeduped.delete(skill);
      }
    }
  }

  const preferredFinal = new Set([...preferredDeduped].filter(s => !requiredDeduped.has(s)));
  const sortByWeight = (a: string, b: string) => getWeight(b) - getWeight(a);

  return {
    jobTitle:           extractJobTitle(jdText),
    requiredSkills:     [...requiredDeduped].sort(sortByWeight),
    preferredSkills:    [...preferredFinal].sort(sortByWeight),
    yearsRequired:      extractYearsRequired(jdText),
    educationRequired:  extractEducationRequired(jdText),
    gatekeepers:        GATEKEEPER_PATTERNS.filter(g => g.pattern.test(jdText)).map(g => g.label),
    sectionSplitWorked: worked,
  };
}

// ─── Resume Parser ────────────────────────────────────────────────────────────

const EXPERIENCE_HEADINGS = [
  /^\s*(work\s+)?experience\s*[:\-]?\s*$/i,
  /^\s*employment(\s+history)?\s*[:\-]?\s*$/i,
  /^\s*professional\s+(experience|background)\s*[:\-]?\s*$/i,
  /^\s*(relevant\s+)?projects?\s*[:\-]?\s*$/i,
  /^\s*research\s+(experience|projects?)\s*[:\-]?\s*$/i,
];

const SKILLS_SECTION_HEADINGS = [
  /^\s*(technical\s+)?skills?\s*[:\-]?\s*$/i,
  /^\s*core\s+competencies\s*[:\-]?\s*$/i,
  /^\s*technologies?\s*[:\-]?\s*$/i,
  /^\s*tools?\s+(&\s+technologies?)?\s*[:\-]?\s*$/i,
];

const EDUCATION_HEADINGS = [
  /^\s*education(\s+&\s+training)?\s*[:\-]?\s*$/i,
  /^\s*academic\s+background\s*[:\-]?\s*$/i,
];

function splitResumeSections(text: string): { experience: string; skills: string; education: string } {
  type T = 'experience' | 'skills' | 'education' | 'other';
  const sections: { type: T; lines: string[] }[] = [];
  let currentType: T = 'other';
  let currentLines: string[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const isExp   = EXPERIENCE_HEADINGS.some(p => p.test(trimmed))     && trimmed.length < 60;
    const isSkill = SKILLS_SECTION_HEADINGS.some(p => p.test(trimmed)) && trimmed.length < 60;
    const isEdu   = EDUCATION_HEADINGS.some(p => p.test(trimmed))      && trimmed.length < 60;

    if      (isExp)   { if (currentLines.length) sections.push({ type: currentType, lines: currentLines }); currentType = 'experience'; currentLines = []; }
    else if (isSkill) { if (currentLines.length) sections.push({ type: currentType, lines: currentLines }); currentType = 'skills';     currentLines = []; }
    else if (isEdu)   { if (currentLines.length) sections.push({ type: currentType, lines: currentLines }); currentType = 'education';  currentLines = []; }
    else { currentLines.push(line); }
  }
  if (currentLines.length) sections.push({ type: currentType, lines: currentLines });

  return {
    experience: sections.filter(s => s.type === 'experience').map(s => s.lines.join('\n')).join('\n').trim(),
    skills:     sections.filter(s => s.type === 'skills').map(s => s.lines.join('\n')).join('\n').trim(),
    education:  sections.filter(s => s.type === 'education').map(s => s.lines.join('\n')).join('\n').trim(),
  };
}

function extractYearsExperience(text: string): number | null {
  const rangePattern = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4})\s*[-–—]\s*(present|current|now|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4}))/gi;
  const currentYear = new Date().getFullYear();
  let earliest: number | null = null;
  let latest: number | null = null;
  let m: RegExpExecArray | null;

  while ((m = rangePattern.exec(text)) !== null) {
    const start = parseInt(m[1], 10);
    const endStr = m[2].toLowerCase();
    const end = /present|current|now/.test(endStr) ? currentYear : parseInt(m[3] || m[2], 10);
    if (!isNaN(start) && start >= 1990 && start <= currentYear) {
      if (earliest === null || start < earliest) earliest = start;
    }
    if (!isNaN(end) && end >= 1990 && end <= currentYear + 1) {
      if (latest === null || end > latest) latest = end;
    }
  }

  if (earliest !== null && latest !== null) return Math.max(0, latest - earliest);

  const stated = /(\d+)\+?\s+years?\s+of\s+(?:professional\s+)?experience/i.exec(text);
  if (stated) return parseInt(stated[1], 10);

  return null;
}

function extractEducationLevel(text: string): ParsedResume['educationLevel'] {
  const lower = text.toLowerCase();
  if (/\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/.test(lower)) return 'phd';
  if (/\bmaster'?s?\b|\bm\.s\.?\b|\bm\.eng\b|\bmba\b/.test(lower)) return 'masters';
  if (/\bbachelor'?s?\b|\bb\.s\.?\b|\bb\.a\.?\b|\bundergraduate\b/.test(lower)) return 'bachelors';
  if (/\bhigh school\b|\bged\b/.test(lower)) return 'high_school';
  return null;
}

export function parseResume(resumeText: string): ParsedResume {
  const sections = splitResumeSections(resumeText);
  const expText    = sections.experience || resumeText;
  const skillsText = sections.skills     || '';

  const inContextExpanded = applyImpliedSkills(scanText(expText));
  const listedExpanded    = applyImpliedSkills(scanText(skillsText));
  const allExpanded       = applyImpliedSkills(scanText(resumeText));

  const allSkills       = [...allExpanded].sort();
  const skillsInContext = allSkills.filter(s => inContextExpanded.has(s));
  const skillsListOnly  = allSkills.filter(s => listedExpanded.has(s) && !inContextExpanded.has(s));

  // Use experience section only for date math — prevents education date ranges
  // (e.g. "Aug 2020 - Jul 2024 BTech") from inflating years of work experience.
  const dateSourceText = sections.experience || resumeText;

  return {
    skills: allSkills,
    skillsInContext,
    skillsListOnly,
    yearsExperience: extractYearsExperience(dateSourceText),
    educationLevel:  extractEducationLevel(resumeText),
  };
}

// ─── Score Computation ────────────────────────────────────────────────────────

const EDU_RANK: Record<string, number> = { high_school: 1, bachelors: 2, masters: 3, phd: 4 };

export function computeHybridScore(resume: ParsedResume, jd: ParsedJD): MatchResult {
  const resumeSet    = new Set(resume.skills);
  const inContextSet = new Set(resume.skillsInContext);

  // Dynamic weight rebalancing: when a JD has many preferred skills (concrete tools list),
  // shift 13pts from required to preferred to reflect the JD's actual emphasis.
  const prefRatio = jd.requiredSkills.length === 0 ? 0
    : jd.preferredSkills.length / jd.requiredSkills.length;
  const W_REQ  = prefRatio >= 0.6 ? 32 : 45;
  const W_PREF = prefRatio >= 0.6 ? 28 : 15;

  // 1. Required skills — weighted by skill importance
  const matchedRequired = jd.requiredSkills.filter(s => resumeSet.has(s));
  const missingRequired = jd.requiredSkills.filter(s => !resumeSet.has(s));

  let weightedPossible = 0;
  let weightedMatched  = 0;
  for (const s of jd.requiredSkills) {
    const w = getWeight(s);
    weightedPossible += w;
    if (resumeSet.has(s)) weightedMatched += w;
  }

  const requiredScore = jd.requiredSkills.length === 0
    ? Math.round(W_REQ * 0.8)
    : Math.round((weightedMatched / weightedPossible) * W_REQ);

  // 2. Depth of evidence — in-context (bullets) vs listed-only
  let depthSum = 0;
  for (const s of matchedRequired) {
    depthSum += inContextSet.has(s) ? 1.0 : 0.4;
  }
  const depthScore = matchedRequired.length === 0
    ? 0
    : Math.round((depthSum / matchedRequired.length) * 20);

  // 3. Preferred skills — count-based, dynamic weight
  const matchedPreferred = jd.preferredSkills.filter(s => resumeSet.has(s));
  const missingPreferred = jd.preferredSkills.filter(s => !resumeSet.has(s));

  const preferredScore = jd.preferredSkills.length === 0
    ? Math.round(W_PREF * 0.67)
    : Math.round((matchedPreferred.length / jd.preferredSkills.length) * W_PREF);

  // 4. Experience — exponential decay on years gap
  let experienceScore = 10; // neutral when data missing
  if (jd.yearsRequired !== null && resume.yearsExperience !== null) {
    const gap = Math.max(0, jd.yearsRequired - resume.yearsExperience);
    experienceScore = Math.round(12 * Math.exp(-0.6 * gap));
  } else if (jd.yearsRequired === null) {
    experienceScore = 12; // no requirement — full credit
  }

  // 5. Education — rank comparison
  let educationScore = 5; // neutral when data missing
  if (jd.educationRequired && resume.educationLevel) {
    const rr = EDU_RANK[resume.educationLevel]  ?? 0;
    const jr = EDU_RANK[jd.educationRequired]   ?? 0;
    if      (rr >= jr + 1) educationScore = 8;  // over-qualified
    else if (rr === jr)    educationScore = 8;  // exact match
    else if (rr === jr - 1) educationScore = 4; // one level below
    else                   educationScore = 0;  // significantly below
  } else if (!jd.educationRequired) {
    educationScore = 8;
  }

  const raw        = requiredScore + depthScore + preferredScore + experienceScore + educationScore;
  const finalScore = Math.max(0, Math.min(100, Math.round(raw)));

  const label: MatchResult['label'] =
    finalScore >= 80 ? 'Excellent' :
    finalScore >= 65 ? 'Strong'    :
    finalScore >= 50 ? 'Good'      :
    finalScore >= 35 ? 'Partial'   : 'Weak';

  return {
    score: finalScore,
    label,
    breakdown: { requiredScore, depthScore, preferredScore, experienceScore, educationScore },
    matchedRequired,
    missingRequired,
    matchedPreferred,
    missingPreferred,
    gatekeepers: jd.gatekeepers,
  };
}

// ─── GPT Explanation ──────────────────────────────────────────────────────────

export async function generateExplanation(
  score: number,
  label: string,
  breakdown: ScoreBreakdown,
  matchedRequired: string[],
  missingRequired: string[],
  matchedPreferred: string[],
  resumeSnippet: string,
  jdSnippet: string,
  openai: OpenAI
): Promise<Explanation> {
  const prompt = `You are a career coach reviewing a resume against a job description.

MATCH SCORE: ${score}/100 — ${label} (FINAL — do not suggest a different number)

SCORE BREAKDOWN:
- Required skills (weighted): ${breakdown.requiredScore}
- Depth of evidence: ${breakdown.depthScore}/20
- Preferred skills: ${breakdown.preferredScore}
- Experience: ${breakdown.experienceScore}/12
- Education: ${breakdown.educationScore}/8

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
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.choices[0].message.content?.trim() || '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(clean);
  } catch (err: any) {
    console.error('[matcher] generateExplanation failed:', err.message);
    return {
      summary: `This resume scores ${score}/100 (${label}) for this role. ${score >= 65 ? 'Strong alignment detected.' : score >= 50 ? 'Partial fit — some gaps exist.' : 'Significant skill gaps detected.'}`,
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
  const parsedJD     = options?.cachedParsedJD     ?? parseJD(jdText);
  const parsedResume = options?.cachedParsedResume ?? parseResume(resumeText);
  const matchResult  = computeHybridScore(parsedResume, parsedJD);

  const explanation = await generateExplanation(
    matchResult.score,
    matchResult.label,
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
