// Run with: npm run test --workspace=web   (tsx tests/roleInsights.spec.ts)
// Exercises the "response rate by role" and "JD signals" analytics — the
// keyword classifiers are the whole point of these features, so their
// false-positive/negative behavior needs real coverage, not eyeballing.

import assert from 'node:assert/strict';
import { classifyRole, calcRoleCategoryStats, calcJdSignals, hasResponded } from '../src/lib/roleInsights';
import type { JobApplication } from '../src/lib/types';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    throw err;
  }
}

function app(over: Partial<JobApplication> = {}): JobApplication {
  return {
    id: Math.random().toString(36), company: 'Acme', position: 'Software Engineer',
    location: '', salary: '', dateApplied: '2026-06-01', status: 'Applied',
    source: 'LinkedIn', referral: 'No', jobUrl: '', jobDescription: '', notes: '',
    documents: [], timeline: [{ status: 'Applied', ts: Date.now() }], last_updated: '2026-06-01',
    ...over,
  };
}

// ── hasResponded ───────────────────────────────────────────────────────────

test('hasResponded: Applied/Ghosted/Withdrawn are not responses, everything else is', () => {
  assert.equal(hasResponded(app({ status: 'Applied' })), false);
  assert.equal(hasResponded(app({ status: 'Ghosted' })), false);
  assert.equal(hasResponded(app({ status: 'Withdrawn' })), false);
  for (const s of ['Screening', 'Interview Scheduled', 'Interview Completed', 'Offer', 'Rejected'] as const) {
    assert.equal(hasResponded(app({ status: s })), true, `${s} should count as a response`);
  }
});

// ── classifyRole ────────────────────────────────────────────────────────────

test('classifyRole: real-world titles from the app land in sensible buckets', () => {
  const cases: [string, string][] = [
    ['AI Engineer', 'AI/ML'],
    ['Entry Level Data/AI Engineer', 'AI/ML'],
    ['Junior AI Scientist', 'AI/ML'],
    ['Associate Machine Learning Engineer', 'AI/ML'],
    ['AI/ML Software Engineer', 'AI/ML'],
    ['Artificial Intelligence Specialist', 'AI/ML'],
    ['AI Platform Engineer', 'AI/ML'],
    ['Automated Test Engineer', 'QA/Test'],
    ['Junior DevOps Engineer', 'DevOps/Infra'],
    ['Associate Software Engineer', 'Software/Backend'],
    ['Applications Developer', 'Software/Backend'],
    ['Software Development Engineer - 2026', 'Software/Backend'],
    ['Full Stack Software Engineer, ChatGPT Finances', 'Software/Backend'],
    ['ADS Programmer', 'Software/Backend'],
    ['Scientific Solutions Architect', 'Software/Backend'],
    ['Customer Experience Specialist', 'Other'],
    ['Research Assistant (Tropical Wildfires)', 'Other'],
    ['Member of Technical Staff', 'Other'],
  ];
  for (const [title, expected] of cases) {
    assert.equal(classifyRole(title), expected, `"${title}" should classify as ${expected}`);
  }
});

test('classifyRole: word-boundary matching avoids false "ai"/"ml" hits inside unrelated words', () => {
  // "detail", "maintain", "domain", "chain" all literally contain the substring "ai"
  for (const title of ['Detail Oriented Coordinator', 'Maintenance Technician', 'Domain Registrar', 'Supply Chain Analyst']) {
    assert.notEqual(classifyRole(title), 'AI/ML', `"${title}" must not false-match AI/ML`);
  }
});

test('classifyRole: empty/missing position falls back to Other, does not throw', () => {
  assert.equal(classifyRole(''), 'Other');
  assert.equal(classifyRole(undefined as unknown as string), 'Other');
});

// ── calcRoleCategoryStats ───────────────────────────────────────────────────

test('calcRoleCategoryStats: buckets and computes per-bucket response rate correctly', () => {
  const apps = [
    app({ position: 'AI Engineer', status: 'Rejected' }),       // AI/ML, responded
    app({ position: 'ML Engineer', status: 'Applied' }),         // AI/ML, no response
    app({ position: 'AI Scientist', status: 'Screening' }),      // AI/ML, responded
    app({ position: 'Software Engineer', status: 'Applied' }),   // Software, no response
    app({ position: 'Backend Developer', status: 'Applied' }),   // Software, no response
  ];
  const stats = calcRoleCategoryStats(apps);
  const aiml = stats.find((s) => s.category === 'AI/ML')!;
  const sw = stats.find((s) => s.category === 'Software/Backend')!;
  assert.equal(aiml.count, 3);
  assert.equal(aiml.responseRate, 67, '2 of 3 AI/ML apps responded -> 67%');
  assert.equal(sw.count, 2);
  assert.equal(sw.responseRate, 0);
  // sorted by response rate descending
  assert.equal(stats[0].category, 'AI/ML');
});

test('calcRoleCategoryStats: empty input returns empty array, does not throw', () => {
  assert.deepEqual(calcRoleCategoryStats([]), []);
});

// ── calcJdSignals ────────────────────────────────────────────────────────────

test('calcJdSignals: below the minimum sample size, a signal is excluded entirely', () => {
  const apps = [
    app({ jobDescription: 'This role requires Python and Django experience.', status: 'Offer' }),
    app({ jobDescription: 'Some other JD with no relevant keywords at all here.', status: 'Applied' }),
  ];
  const signals = calcJdSignals(apps);
  assert.ok(!signals.some((s) => s.label === 'Python'), 'only 1 sample — must not appear, even at 100% response rate');
});

test('calcJdSignals: meets sample threshold, response rate computed only over matching apps', () => {
  const apps = [
    app({ jobDescription: 'Looking for a Python developer for our remote team.', status: 'Offer' }),
    app({ jobDescription: 'Python and Flask backend role, remote friendly.', status: 'Screening' }),
    app({ jobDescription: 'Senior Python engineer needed, on-site only.', status: 'Applied' }),
    app({ jobDescription: 'Java and Kotlin backend engineer, JVM ecosystem only.', status: 'Applied' }),
  ];
  const signals = calcJdSignals(apps);
  const python = signals.find((s) => s.label === 'Python')!;
  assert.ok(python, 'Python appears in 3 JDs, meets threshold of 3');
  assert.equal(python.count, 3);
  assert.equal(python.responseRate, 67, '2 of 3 Python-mentioning apps responded -> 67%, the 4th app must not count');
});

test('calcJdSignals: known limitation — keyword presence is not negation-aware', () => {
  // "no Python required" mentions the word "Python" and will be counted as a
  // match. This is a simple keyword scan, not NLP — documenting the tradeoff
  // rather than pretending it doesn't exist.
  const apps = [
    app({ jobDescription: 'No Python required for this role.', status: 'Applied' }),
    app({ jobDescription: 'Python is a plus but not required.', status: 'Applied' }),
    app({ jobDescription: 'We do not use Python here.', status: 'Applied' }),
  ];
  const signals = calcJdSignals(apps);
  assert.equal(signals.find((s) => s.label === 'Python')!.count, 3);
});

test('calcJdSignals: sponsorship/visa keyword group catches common phrasings', () => {
  const apps = [
    app({ jobDescription: 'We are unable to provide visa sponsorship for this role.', status: 'Rejected' }),
    app({ jobDescription: 'Must have work authorization; no sponsorship available.', status: 'Applied' }),
    app({ jobDescription: 'OPT/CPT candidates welcome to apply.', status: 'Screening' }),
  ];
  const signals = calcJdSignals(apps);
  const sponsorship = signals.find((s) => s.label === 'Sponsorship/Visa mentioned')!;
  assert.ok(sponsorship, 'all 3 JDs should match the sponsorship/visa group');
  assert.equal(sponsorship.count, 3);
});

test('calcJdSignals: applications without a JD are ignored, not counted as non-matches', () => {
  const apps = [
    app({ jobDescription: '', status: 'Offer' }),
    app({ jobDescription: '   ', status: 'Offer' }),
    app({ jobDescription: 'Python role here', status: 'Applied' }),
    app({ jobDescription: 'Also mentions Python explicitly', status: 'Applied' }),
    app({ jobDescription: 'Python again for good measure', status: 'Screening' }),
  ];
  const signals = calcJdSignals(apps);
  const python = signals.find((s) => s.label === 'Python')!;
  assert.equal(python.count, 3, 'blank-JD apps must not be counted in the denominator at all');
});

test('calcJdSignals: empty input returns empty array, does not throw', () => {
  assert.deepEqual(calcJdSignals([]), []);
});

console.log(`\nroleInsights.spec: ${passed} tests passed`);
