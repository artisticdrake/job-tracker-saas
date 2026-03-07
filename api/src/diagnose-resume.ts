
/**
 * diagnose-resume.ts
 * Pulls the raw extracted text for user 78ce5c4d-82ec-4d5e-9f72-27b2b3673ac1
 * and runs parseResume() to diagnose skill extraction issues.
 *
 * Run from api/ folder:
 *   npx tsx src/diagnose-resume.ts
 *
 * Outputs:
 *   - raw-extracted-text.txt     → exactly what's stored in extracted_text column
 *   - parsed-resume-result.json  → what the LLM extracted
 *   - parse-diagnosis.txt        → human-readable diagnosis of what went wrong
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { parseResume } from './matcher';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const USER_ID = '78ce5c4d-82ec-4d5e-9f72-27b2b3673ac1';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: (process.env.OPENAI_API_KEY2 || '').trim() });

// Skills we expect to see in an ML/CS resume — if these are missing, something is wrong
const EXPECTED_SKILLS = [
  'python', 'pytorch', 'tensorflow', 'machine learning', 'deep learning',
  'sql', 'docker', 'aws', 'git', 'react', 'fastapi', 'nlp',
  'scikit-learn', 'numpy', 'pandas', 'linux', 'typescript', 'javascript',
];

async function main() {
  console.log('\n🔍 Resume Parse Diagnostics');
  console.log(`   User: ${USER_ID}`);
  console.log('─'.repeat(60));

  // ── 1. Fetch all resumes for this user ──
  const { data: resumes, error } = await supabase
    .from('resumes')
    .select('id, file_name, extracted_text, parsed_resume, is_active, file_size, uploaded_at')
    .eq('user_id', USER_ID)
    .order('uploaded_at', { ascending: false });

  if (error) { console.error('❌ Supabase error:', error.message); process.exit(1); }
  if (!resumes?.length) { console.error('❌ No resumes found for this user ID.'); process.exit(1); }

  console.log(`\nFound ${resumes.length} resume(s):`);
  resumes.forEach((r, i) => {
    const hasText = !!r.extracted_text;
    const hasParsed = !!r.parsed_resume;
    const textLen = r.extracted_text?.length ?? 0;
    console.log(`  ${i + 1}. ${r.file_name}`);
    console.log(`     Active: ${r.is_active ? 'YES' : 'no'} | extracted_text: ${hasText ? `${textLen} chars` : '❌ MISSING'} | parsed_resume: ${hasParsed ? '✓ cached' : '❌ not cached'}`);
  });

  // ── 2. Pick the active one, or ask user to pick ──
  const active = resumes.find(r => r.is_active) || resumes[0];
  console.log(`\n▶ Diagnosing: "${active.file_name}"`);

  // ── 3. Check if extracted_text exists ──
  if (!active.extracted_text) {
    console.error('\n❌ PROBLEM: extracted_text is NULL or empty.');
    console.error('   This means the Parse button was never clicked, or text extraction failed.');
    console.error('   Fix: Go to Files tab → click "Parse" on this resume.');
    process.exit(1);
  }

  const rawText = active.extracted_text;
  console.log(`\n── Raw Extracted Text ──────────────────────────────────`);
  console.log(`Length: ${rawText.length} chars | Words: ${rawText.split(/\s+/).filter(Boolean).length}`);
  console.log('\nFull text:\n');
  console.log(rawText);
  console.log('\n────────────────────────────────────────────────────────');

  // Write raw text to file
  const rawPath = path.resolve(__dirname, 'raw-extracted-text.txt');
  fs.writeFileSync(rawPath, rawText, 'utf-8');
  console.log(`\n✅ Raw text written to: raw-extracted-text.txt`);

  // ── 4. Check for common extraction problems ──
  const diagLines: string[] = [];
  diagLines.push(`DIAGNOSIS REPORT — ${new Date().toISOString()}`);
  diagLines.push(`Resume: ${active.file_name}`);
  diagLines.push(`Extracted text length: ${rawText.length} chars`);
  diagLines.push('');

  // Check for garbled/binary content
  const nonAsciiRatio = (rawText.match(/[^\x20-\x7E\n\r\t]/g) || []).length / rawText.length;
  if (nonAsciiRatio > 0.05) {
    diagLines.push(`⚠ HIGH NON-ASCII RATIO: ${(nonAsciiRatio * 100).toFixed(1)}% — resume may be image-based or scanned PDF`);
    console.log(`\n⚠ WARNING: ${(nonAsciiRatio * 100).toFixed(1)}% non-ASCII characters — likely a scanned/image PDF. Text extraction will be poor.`);
  } else {
    diagLines.push(`✓ Text quality OK — ${(nonAsciiRatio * 100).toFixed(1)}% non-ASCII`);
  }

  // Check if text is suspiciously short
  if (rawText.length < 500) {
    diagLines.push(`❌ TEXT TOO SHORT: only ${rawText.length} chars — extraction likely failed`);
    console.log(`\n❌ Text is only ${rawText.length} chars — way too short for a full resume`);
  } else if (rawText.length < 1500) {
    diagLines.push(`⚠ TEXT SHORT: ${rawText.length} chars — may be missing sections`);
  } else {
    diagLines.push(`✓ Text length OK: ${rawText.length} chars`);
  }

  // Check for expected skills directly in raw text
  diagLines.push('\nSkill presence in raw extracted text:');
  const missingFromRaw: string[] = [];
  EXPECTED_SKILLS.forEach(skill => {
    const found = rawText.toLowerCase().includes(skill.toLowerCase());
    diagLines.push(`  ${found ? '✓' : '✗'} ${skill}`);
    if (!found) missingFromRaw.push(skill);
  });

  if (missingFromRaw.length > 0) {
    console.log(`\n⚠ These expected skills are NOT in the raw text: ${missingFromRaw.join(', ')}`);
    console.log('  If your resume has these skills, the PDF text extraction is losing content.');
  } else {
    console.log('\n✓ All expected skills found in raw text');
  }

  // ── 5. Run parseResume() ──
  console.log('\n── Running parseResume() via GPT-4o-mini ───────────────');
  const start = Date.now();
  const parsed = await parseResume(rawText, openai);
  const elapsed = Date.now() - start;

  console.log(`Done in ${elapsed}ms`);
  console.log(`Skills extracted: ${parsed.skills.length}`);
  console.log(`Years experience: ${parsed.yearsExp ?? 'not detected'}`);
  console.log(`Skills: ${parsed.skills.join(', ')}`);

  // ── 6. Diagnose what the LLM missed ──
  diagLines.push('\nSkill extraction by LLM (parseResume):');
  diagLines.push(`  Total extracted: ${parsed.skills.length}`);
  diagLines.push(`  Years exp: ${parsed.yearsExp ?? 'null'}`);
  diagLines.push(`  Skills: ${parsed.skills.join(', ')}`);
  diagLines.push('');
  diagLines.push('Skills in raw text but MISSED by LLM:');

  const inRawButMissedByLLM: string[] = [];
  EXPECTED_SKILLS.forEach(skill => {
    const inRaw = rawText.toLowerCase().includes(skill.toLowerCase());
    const inParsed = parsed.skills.includes(skill.toLowerCase());
    if (inRaw && !inParsed) {
      inRawButMissedByLLM.push(skill);
      diagLines.push(`  ✗ "${skill}" — in raw text but NOT extracted by LLM`);
    }
  });

  if (inRawButMissedByLLM.length > 0) {
    console.log(`\n❌ LLM missed these skills that ARE in the raw text: ${inRawButMissedByLLM.join(', ')}`);
    console.log('   Fix: Adjust the parseResume() prompt in matcher.ts');
  } else if (parsed.skills.length < 5) {
    console.log('\n❌ LLM extracted very few skills — the raw text may be garbled');
  } else {
    console.log('\n✓ LLM extraction looks good');
  }

  // ── 7. Write all output files ──
  const parsedPath = path.resolve(__dirname, 'parsed-resume-result.json');
  fs.writeFileSync(parsedPath, JSON.stringify({
    meta: {
      user_id: USER_ID,
      resume_id: active.id,
      file_name: active.file_name,
      is_active: active.is_active,
      extracted_text_length: rawText.length,
      non_ascii_ratio: nonAsciiRatio,
      elapsed_ms: elapsed,
      diagnosed_at: new Date().toISOString(),
    },
    parsed_resume: parsed,
    cached_parsed_resume: active.parsed_resume || null,
    expected_skills_in_raw: EXPECTED_SKILLS.filter(s => rawText.toLowerCase().includes(s)),
    expected_skills_missing_from_raw: missingFromRaw,
    expected_skills_missed_by_llm: inRawButMissedByLLM,
  }, null, 2));

  const diagPath = path.resolve(__dirname, 'parse-diagnosis.txt');
  fs.writeFileSync(diagPath, diagLines.join('\n'), 'utf-8');

  console.log('\n── Output files ────────────────────────────────────────');
  console.log(`  raw-extracted-text.txt     → full raw text from DB`);
  console.log(`  parsed-resume-result.json  → LLM extraction result + diagnosis`);
  console.log(`  parse-diagnosis.txt        → human-readable diagnosis`);
  console.log('\nShare raw-extracted-text.txt if skills are missing — that tells us');
  console.log('whether it\'s a PDF extraction problem or an LLM prompt problem.\n');
}

main().catch(err => {
  console.error('\n💥 Error:', err.message);
  process.exit(1);
});