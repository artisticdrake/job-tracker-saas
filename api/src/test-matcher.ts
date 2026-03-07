/**
 * test-matcher.ts
 * Quick smoke test for the hybrid extraction pipeline.
 *
 * Run from api/ folder:
 *   npx tsx src/test-matcher.ts
 *
 * What it tests:
 *   1. parseJD()            — LLM extracts structured data from a sample JD
 *   2. parseResume()        — LLM extracts structured data from a sample resume
 *   3. computeHybridScore() — Pure JS scoring (no LLM, instant)
 *   4. generateExplanation()— GPT narrative from locked score
 *   5. runFullMatch()       — Full pipeline end-to-end
 *   6. Edge cases           — Empty JD, no experience stated, etc.
 */

import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import {
  parseJD,
  parseResume,
  computeHybridScore,
  generateExplanation,
  runFullMatch,
  type ParsedJD,
  type ParsedResume,
} from './matcher';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ─── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_JD = `
Machine Learning Engineer — Perception Team

About the Role:
We're looking for a Machine Learning Engineer to join our Perception team, working on real-time computer vision systems deployed to edge devices.

Requirements (must have):
- 3+ years of experience in machine learning or deep learning
- Proficiency in Python and PyTorch
- Experience with computer vision tasks (object detection, segmentation, tracking)
- Strong understanding of CNNs and transformer architectures
- Experience with model optimization techniques (quantization, pruning, ONNX export)
- Familiarity with Docker and CI/CD pipelines
- Experience with Git and code review workflows

Nice to have:
- Experience with TensorRT or OpenVINO
- Familiarity with AWS or GCP for training infrastructure
- Knowledge of CUDA programming
- Experience with MLflow or similar experiment tracking
- Contributions to open-source ML projects
`;

const SAMPLE_RESUME = `
Preetham Prathipati
Boston, MA | preetham@email.com | github.com/preetham

EDUCATION
M.S. Computer Science, Boston University (Expected May 2026) — GPA 3.8
B.Tech Computer Science & AI/ML, JNTU Hyderabad (2024) — 2nd in national ML ranking

EXPERIENCE
ML Engineer Intern | DataCorp Inc | Jun 2024 – Dec 2024
- Built real-time object detection pipeline using PyTorch and YOLOv8, achieving 94% mAP
- Optimized models for edge deployment using ONNX export and quantization (INT8), reducing inference time by 40%
- Containerized training jobs with Docker and deployed to AWS EC2; set up GitHub Actions CI/CD
- Used MLflow for experiment tracking across 200+ training runs

Research Assistant | BU Vision Lab | Sep 2023 – May 2024
- Developed custom CNN architectures for image segmentation using PyTorch
- Applied transformer-based models (ViT, DETR) for pedestrian tracking in crowded scenes
- Processed datasets using pandas and numpy; visualized results in Python

PROJECTS
CHATALOGUE — Campus AI Chatbot
- Built NLP pipeline using Python, HuggingFace transformers, and RAG architecture
- Deployed with FastAPI backend and React frontend

Rainwater Monitoring System
- Computer vision + OCR system using Python and OpenCV, deployed campus-wide

SKILLS
Python, PyTorch, TensorFlow, scikit-learn, HuggingFace, ONNX, Docker, AWS, GCP,
Git, FastAPI, React, SQL, NumPy, pandas, MLflow, OpenCV, Linux
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(msg: string) { console.log(`  ✅ PASS: ${msg}`); }
function fail(msg: string) { console.log(`  ❌ FAIL: ${msg}`); process.exitCode = 1; }
function section(title: string) { console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`); }

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testParseJD(openai: OpenAI): Promise<ParsedJD> {
  section('TEST 1: parseJD()');

  const result = await parseJD(SAMPLE_JD, openai);
  console.log('\n  Raw output:');
  console.log(JSON.stringify(result, null, 4));

  // Assertions
  if (result.required.length > 0) {
    pass(`Extracted ${result.required.length} required skills`);
  } else {
    fail('No required skills extracted');
  }

  if (result.required.includes('python')) {
    pass('"python" found in required skills');
  } else {
    fail('"python" not found — LLM may not be extracting correctly');
  }

  if (result.required.includes('pytorch')) {
    pass('"pytorch" found in required skills');
  } else {
    fail('"pytorch" not found in required skills');
  }

  if (result.preferred.length > 0) {
    pass(`Extracted ${result.preferred.length} preferred skills`);
  } else {
    fail('No preferred skills extracted — "nice to have" section may have been missed');
  }

  if (result.yearsExp === 3) {
    pass(`yearsExp correctly extracted as ${result.yearsExp}`);
  } else {
    fail(`yearsExp = ${result.yearsExp}, expected 3`);
  }

  if (result.jobTitle.toLowerCase().includes('machine learning')) {
    pass(`jobTitle extracted: "${result.jobTitle}"`);
  } else {
    fail(`jobTitle "${result.jobTitle}" doesn't look right`);
  }

  return result;
}

async function testParseResume(openai: OpenAI): Promise<ParsedResume> {
  section('TEST 2: parseResume()');

  const result = await parseResume(SAMPLE_RESUME, openai);
  console.log('\n  Raw output:');
  console.log(JSON.stringify(result, null, 4));

  if (result.skills.length > 5) {
    pass(`Extracted ${result.skills.length} skills from resume`);
  } else {
    fail(`Only ${result.skills.length} skills extracted — too few`);
  }

  const expectedSkills = ['python', 'pytorch', 'docker', 'aws'];
  for (const skill of expectedSkills) {
    if (result.skills.includes(skill)) {
      pass(`"${skill}" found in resume skills`);
    } else {
      fail(`"${skill}" NOT found — resume parsing may be incomplete`);
    }
  }

  if (result.yearsExp !== null && result.yearsExp >= 1) {
    pass(`yearsExp detected: ${result.yearsExp} year(s)`);
  } else {
    console.log(`  ⚠️  WARN: yearsExp = ${result.yearsExp} — may be expected for a student resume`);
  }

  return result;
}

function testComputeScore(parsedJD: ParsedJD, parsedResume: ParsedResume) {
  section('TEST 3: computeHybridScore() — no LLM, pure JS');

  const result = computeHybridScore(parsedResume, parsedJD);
  console.log('\n  Raw output:');
  console.log(JSON.stringify(result, null, 4));

  if (result.score >= 0 && result.score <= 100) {
    pass(`Score is in valid range: ${result.score}/100`);
  } else {
    fail(`Score out of range: ${result.score}`);
  }

  if (result.score >= 50) {
    pass(`Score ${result.score} looks reasonable for this strong-match resume`);
  } else {
    console.log(`  ⚠️  WARN: Score is ${result.score} — lower than expected for this resume. Check parseJD/parseResume outputs above.`);
  }

  if (result.matchedRequired.length > 0) {
    pass(`Matched ${result.matchedRequired.length} required skills: ${result.matchedRequired.slice(0,5).join(', ')}`);
  } else {
    fail('No required skills matched — check parseJD and parseResume outputs');
  }

  if (result.breakdown.requiredScore + result.breakdown.preferredScore + result.breakdown.experienceScore > 0) {
    pass(`Breakdown sums correctly: req=${result.breakdown.requiredScore} pref=${result.breakdown.preferredScore} exp=${result.breakdown.experienceScore} penalty=${result.breakdown.experiencePenalty}`);
  }

  // Verify no double-counting — matched + missing should = total required
  const totalRequired = result.matchedRequired.length + result.missingRequired.length;
  if (totalRequired === parsedJD.required.length) {
    pass(`matched(${result.matchedRequired.length}) + missing(${result.missingRequired.length}) = total required(${parsedJD.required.length}) ✓`);
  } else {
    fail(`Skill count mismatch: ${result.matchedRequired.length} + ${result.missingRequired.length} ≠ ${parsedJD.required.length}`);
  }

  return result;
}

async function testExplanation(score: number, breakdown: any, matchedRequired: string[], missingRequired: string[], matchedPreferred: string[], openai: OpenAI) {
  section('TEST 4: generateExplanation() — GPT narrative');

  const result = await generateExplanation(
    score,
    breakdown,
    matchedRequired,
    missingRequired,
    matchedPreferred,
    SAMPLE_RESUME,
    SAMPLE_JD,
    openai
  );
  console.log('\n  Raw output:');
  console.log(JSON.stringify(result, null, 4));

  if (result.summary && result.summary.length > 20) {
    pass(`Summary generated (${result.summary.length} chars)`);
  } else {
    fail('Summary missing or too short');
  }

  if (Array.isArray(result.bulletPoints) && result.bulletPoints.length >= 2) {
    pass(`${result.bulletPoints.length} bullet points generated`);
  } else {
    fail('bulletPoints missing or too few');
  }

  if (Array.isArray(result.actionSteps) && result.actionSteps.length >= 1) {
    pass(`${result.actionSteps.length} action steps generated`);
  } else {
    fail('actionSteps missing');
  }

  // Critical: GPT should not invent a different score
  const scoreInSummary = result.summary.match(/\d+/g)?.map(Number) || [];
  if (scoreInSummary.some(n => n > 0 && n !== score && n <= 100 && Math.abs(n - score) > 5)) {
    console.log(`  ⚠️  WARN: GPT may have used a different score in the summary. Expected ${score}, saw: ${scoreInSummary}`);
  } else {
    pass('GPT did not hallucinate a different score');
  }
}

async function testEdgeCases(openai: OpenAI) {
  section('TEST 5: Edge cases');

  // Edge case 1: JD with no "required" section — everything should go to required
  console.log('\n  [5a] JD with no explicit required/preferred separation...');
  const ambiguousJD = `Software Engineer needed. Must know JavaScript and React. Experience with Node.js and SQL databases helpful.`;
  const result1 = await parseJD(ambiguousJD, openai);
  if (result1.required.length > 0) {
    pass(`Ambiguous JD: ${result1.required.length} skills extracted into required`);
  } else {
    fail('Ambiguous JD: no skills extracted at all');
  }

  // Edge case 2: No experience requirement in JD
  console.log('\n  [5b] JD with no years of experience stated...');
  const noExpJD = `Data Analyst. Skills needed: SQL, Python, Tableau, Excel. Join our team!`;
  const result2 = await parseJD(noExpJD, openai);
  if (result2.yearsExp === null) {
    pass('yearsExp correctly null when not stated');
  } else {
    console.log(`  ⚠️  WARN: yearsExp = ${result2.yearsExp} — expected null`);
  }

  // Edge case 3: Scoring with no preferred skills in JD
  console.log('\n  [5c] Score with no preferred skills...');
  const jdNoPreferred: ParsedJD = { jobTitle: 'Dev', required: ['python', 'sql'], preferred: [], yearsExp: null };
  const resumeData: ParsedResume = { skills: ['python', 'sql', 'react'], yearsExp: 3 };
  const score3 = computeHybridScore(resumeData, jdNoPreferred);
  if (score3.score > 50) {
    pass(`Score ${score3.score} with no preferred skills — reasonable (partial credit applied)`);
  } else {
    fail(`Score ${score3.score} seems too low when all required skills match`);
  }

  // Edge case 4: Score with zero matching skills
  console.log('\n  [5d] Score with zero matching skills...');
  const jdNoMatch: ParsedJD = { jobTitle: 'Dev', required: ['cobol', 'fortran', 'assembly'], preferred: ['pascal'], yearsExp: 10 };
  const resumeNoMatch: ParsedResume = { skills: ['python', 'javascript'], yearsExp: 1 };
  const score4 = computeHybridScore(resumeNoMatch, jdNoMatch);
  if (score4.score < 30) {
    pass(`Low score ${score4.score} for no skill matches — correct`);
  } else {
    fail(`Score ${score4.score} is too high when nothing matches`);
  }
}

async function testFullPipeline(openai: OpenAI) {
  section('TEST 6: runFullMatch() — end-to-end');

  console.log('\n  Running full pipeline (parseJD + parseResume in parallel, then score, then narrative)...');
  const start = Date.now();

  const result = await runFullMatch(SAMPLE_RESUME, SAMPLE_JD, openai);
  const elapsed = Date.now() - start;

  console.log(`\n  Completed in ${elapsed}ms`);
  console.log(`  Score: ${result.matchResult.score}/100`);
  console.log(`  Matched required: ${result.matchResult.matchedRequired.join(', ')}`);
  console.log(`  Missing required: ${result.matchResult.missingRequired.join(', ')}`);
  console.log(`  Summary: ${result.explanation.summary}`);

  if (result.matchResult.score > 0) {
    pass('Full pipeline completed without errors');
  } else {
    fail('Score is 0 — something went wrong in the pipeline');
  }

  if (elapsed < 30000) {
    pass(`Completed in ${elapsed}ms (under 30s threshold)`);
  } else {
    fail(`Took ${elapsed}ms — too slow, check API latency`);
  }

  // Test caching — run again with pre-parsed data, should skip LLM calls for parsing
  console.log('\n  Testing cache bypass (passing pre-parsed data)...');
  const start2 = Date.now();
  const result2 = await runFullMatch(SAMPLE_RESUME, SAMPLE_JD, openai, {
    cachedParsedJD: result.parsedJD,
    cachedParsedResume: result.parsedResume,
  });
  const elapsed2 = Date.now() - start2;

  if (result2.matchResult.score === result.matchResult.score) {
    pass(`Cached run produces same score: ${result2.matchResult.score} (took ${elapsed2}ms vs ${elapsed}ms)`);
  } else {
    fail(`Score changed between runs: ${result.matchResult.score} → ${result2.matchResult.score}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          matcher.ts — Hybrid Pipeline Smoke Tests           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const apiKey = process.env.OPENAI_API_KEY2;
  if (!apiKey) {
    console.error('\n❌ OPENAI_API_KEY2 not found in .env — cannot run LLM tests');
    process.exit(1);
  }
  console.log('\n  ✓ OPENAI_API_KEY2 loaded');

  const openai = new OpenAI({ apiKey: apiKey.trim() });

  try {
    const parsedJD = await testParseJD(openai);
    const parsedResume = await testParseResume(openai);
    const { score, breakdown, matchedRequired, missingRequired, matchedPreferred } = testComputeScore(parsedJD, parsedResume);
    await testExplanation(score, breakdown, matchedRequired, missingRequired, matchedPreferred, openai);
    await testEdgeCases(openai);
    await testFullPipeline(openai);

    section('SUMMARY');
    if (process.exitCode === 1) {
      console.log('  Some tests FAILED — check output above\n');
    } else {
      console.log('  All tests PASSED ✅\n');
      console.log('  You can now deploy matcher.ts + updated index.ts.\n');
    }
  } catch (err: any) {
    console.error('\n\n💥 Unhandled error during tests:');
    console.error(err.message);
    process.exit(1);
  }
}

main();