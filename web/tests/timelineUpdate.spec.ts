// Run with: npm run test --workspace=web   (tsx tests/timelineUpdate.spec.ts)
// Exercises computeTimelineForSubmit — the logic behind "Status Date" backdating
// on the Applications form — plus the tsToYYYYMMDD round-trip it depends on.

import assert from 'node:assert/strict';
import { computeTimelineForSubmit } from '../src/lib/timelineUpdate';
import { tsToYYYYMMDD, todayISO } from '../src/lib/dateUtils';

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

const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();
const NOW = new Date('2026-07-31T15:00:00').getTime();

// ── tsToYYYYMMDD round-trip (the noon-anchor claim this whole feature rests on) ──

test('tsToYYYYMMDD round-trips every date exactly, including month/year/leap boundaries', () => {
  const dates = [
    '2026-01-01', '2025-12-31', '2026-02-28', '2028-02-29',
    '2026-06-27', '2026-07-31', '2026-12-31', '2027-01-01',
  ];
  for (const d of dates) {
    assert.equal(tsToYYYYMMDD(noon(d)), d, `round-trip failed for ${d}`);
  }
});

test('tsToYYYYMMDD is stable across different times of day on the same local date', () => {
  const d = '2026-07-15';
  for (const time of ['T00:00:01', 'T09:00:00', 'T12:00:00', 'T23:59:59']) {
    assert.equal(tsToYYYYMMDD(new Date(`${d}${time}`).getTime()), d);
  }
});

test('tsToYYYYMMDD falls back to today for null/undefined/invalid input', () => {
  assert.equal(tsToYYYYMMDD(null), todayISO());
  assert.equal(tsToYYYYMMDD(undefined), todayISO());
  assert.equal(tsToYYYYMMDD('not-a-date'), todayISO());
});

// ── New application (not editing) ─────────────────────────────────────────────

test('new application: single timeline entry stamped with the given Status Date', () => {
  const r = computeTimelineForSubmit({
    isEdit: false, existingTimeline: undefined,
    formStatus: 'Applied', formStatusDate: '2026-07-20', now: NOW,
  });
  assert.deepEqual(r.timeline, [{ status: 'Applied', ts: noon('2026-07-20') }]);
  assert.equal(r.lastUpdatedTs, noon('2026-07-20'));
});

test('new application: empty status defaults to "Applied"', () => {
  const r = computeTimelineForSubmit({
    isEdit: false, existingTimeline: undefined,
    formStatus: '', formStatusDate: '2026-07-20', now: NOW,
  });
  assert.equal(r.timeline[0].status, 'Applied');
});

test('new application: empty Status Date falls back to now', () => {
  const r = computeTimelineForSubmit({
    isEdit: false, existingTimeline: undefined,
    formStatus: 'Applied', formStatusDate: '', now: NOW,
  });
  assert.equal(r.timeline[0].ts, NOW);
  assert.equal(r.lastUpdatedTs, NOW);
});

// ── Edit: status actually changed — the original reported bug ────────────────

test('edit + status changed: appends a new entry dated by Status Date, not "now"', () => {
  const existingTimeline = [{ status: 'Applied', ts: noon('2026-07-01') }];
  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline,
    formStatus: 'Rejected', formStatusDate: '2026-07-29', now: NOW,
  });
  assert.equal(r.timeline.length, 2);
  assert.deepEqual(r.timeline[1], { status: 'Rejected', ts: noon('2026-07-29') });
  assert.equal(r.timeline[1].ts, noon('2026-07-29'), 'must NOT be stamped with "now" (the original bug)');
  assert.equal(r.lastUpdatedTs, noon('2026-07-29'));
  // earlier history is untouched
  assert.deepEqual(r.timeline[0], existingTimeline[0]);
});

test('edit + status changed: works from a multi-entry history, only appends', () => {
  const existingTimeline = [
    { status: 'Applied', ts: noon('2026-06-01') },
    { status: 'Screening', ts: noon('2026-06-10') },
  ];
  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline,
    formStatus: 'Interview Scheduled', formStatusDate: '2026-06-20', now: NOW,
  });
  assert.equal(r.timeline.length, 3);
  assert.deepEqual(r.timeline.slice(0, 2), existingTimeline);
  assert.equal(r.timeline[2].status, 'Interview Scheduled');
});

// ── Edit: same status, date corrected — the bug just reported ────────────────

test('edit + same status + different Status Date: corrects the existing entry in place', () => {
  const existingTimeline = [
    { status: 'Applied', ts: noon('2026-07-01') },
    { status: 'Rejected', ts: NOW }, // originally logged "today"
  ];
  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline,
    formStatus: 'Rejected', formStatusDate: '2026-07-29', now: NOW,
  });
  assert.equal(r.timeline.length, 2, 'must correct in place, not append a duplicate');
  assert.equal(r.timeline[1].status, 'Rejected');
  assert.equal(r.timeline[1].ts, noon('2026-07-29'), 'the whole point of the fix');
  assert.equal(r.lastUpdatedTs, noon('2026-07-29'));
  assert.deepEqual(r.timeline[0], existingTimeline[0], 'earlier entries untouched');
});

test('edit + same status + different date: only the LAST entry changes, not earlier same-status entries', () => {
  // pathological but possible: two entries could theoretically share a status
  const existingTimeline = [
    { status: 'Applied', ts: noon('2026-07-01') },
    { status: 'Ghosted', ts: noon('2026-07-10') },
    { status: 'Ghosted', ts: NOW },
  ];
  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline,
    formStatus: 'Ghosted', formStatusDate: '2026-07-29', now: NOW,
  });
  assert.equal(r.timeline.length, 3);
  assert.equal(r.timeline[1].ts, noon('2026-07-10'), 'middle entry must be untouched');
  assert.equal(r.timeline[2].ts, noon('2026-07-29'), 'only the last entry is corrected');
});

// ── Edit: unrelated edit (no status/date change) must be a true no-op ────────

test('edit + same status + same-day Status Date: timeline is untouched, lastUpdated stays "now"', () => {
  const existingTimeline = [
    { status: 'Applied', ts: noon('2026-07-01') },
    { status: 'Rejected', ts: new Date('2026-07-29T02:00:00').getTime() }, // early morning, same local day
  ];
  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline,
    formStatus: 'Rejected', formStatusDate: '2026-07-29', now: NOW,
  });
  assert.equal(r.timeline, existingTimeline, 'must return the exact same array reference — no rewrite at all');
  assert.equal(r.lastUpdatedTs, NOW, 'an untouched-timeline save still bumps last_updated to the actual edit time');
});

test('editing an unrelated field (company name) does not silently rewrite the timeline', () => {
  // Simulates handleEdit's default: Status Date is pre-filled from the existing
  // entry's own date, so a save that never touches Status/Status Date is inert.
  const existingEntryTs = new Date('2026-07-18T09:41:00').getTime();
  const existingTimeline = [{ status: 'Screening', ts: existingEntryTs }];
  const formStatusDate = tsToYYYYMMDD(existingEntryTs); // what handleEdit would prefill

  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline,
    formStatus: 'Screening', formStatusDate, now: NOW,
  });
  assert.equal(r.timeline, existingTimeline);
});

// ── Edit: status AND date both changed in the same save ──────────────────────

test('edit + status changed AND date backdated together: appends (status change wins), not an in-place correction', () => {
  const existingTimeline = [{ status: 'Screening', ts: noon('2026-07-10') }];
  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline,
    formStatus: 'Rejected', formStatusDate: '2026-07-29', now: NOW,
  });
  assert.equal(r.timeline.length, 2);
  assert.equal(r.timeline[0].status, 'Screening', 'the old entry must survive, not be overwritten');
  assert.deepEqual(r.timeline[1], { status: 'Rejected', ts: noon('2026-07-29') });
});

// ── Edit: empty/missing existing history ──────────────────────────────────────

test('edit with no prior timeline (legacy/corrupt data): creates a single entry, does not throw', () => {
  const r = computeTimelineForSubmit({
    isEdit: true, existingTimeline: [],
    formStatus: 'Applied', formStatusDate: '2026-07-20', now: NOW,
  });
  assert.deepEqual(r.timeline, [{ status: 'Applied', ts: noon('2026-07-20') }]);
});

test('edit with undefined/null existingTimeline: does not throw', () => {
  for (const existingTimeline of [undefined, null] as const) {
    const r = computeTimelineForSubmit({
      isEdit: true, existingTimeline,
      formStatus: 'Applied', formStatusDate: '2026-07-20', now: NOW,
    });
    assert.equal(r.timeline.length, 1);
  }
});

console.log(`\ntimelineUpdate.spec: ${passed} tests passed`);
