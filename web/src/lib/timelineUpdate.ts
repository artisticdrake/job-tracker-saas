import { tsToYYYYMMDD } from "./dateUtils";
import type { TimelineEntry } from "./types";

export interface TimelineSubmitInput {
  isEdit: boolean;
  existingTimeline: TimelineEntry[] | undefined | null;
  formStatus: string;
  formStatusDate: string;
  now: number;
}

export interface TimelineSubmitResult {
  timeline: TimelineEntry[];
  lastUpdatedTs: number;
}

// Status Date lets the user backdate a status change (e.g. "I was actually
// rejected 2 days ago, just logging it now") instead of always stamping
// "today". Anchored at noon to sidestep any UTC/local day-boundary shift —
// tsToYYYYMMDD reads local date parts back off it, so the round trip is exact.
export function computeTimelineForSubmit({
  isEdit, existingTimeline, formStatus, formStatusDate, now,
}: TimelineSubmitInput): TimelineSubmitResult {
  const statusTs = formStatusDate ? new Date(`${formStatusDate}T12:00:00`).getTime() : now;

  if (!isEdit) {
    return { timeline: [{ status: formStatus || "Applied", ts: statusTs }], lastUpdatedTs: statusTs };
  }

  const prevTl = existingTimeline ?? [];
  const lastEntry = prevTl[prevTl.length - 1];
  const statusChanged = lastEntry?.status !== formStatus;
  // Same status, but the Status Date was edited to a different day — correct
  // that entry's date in place instead of appending a duplicate or ignoring it.
  const dateCorrected = !statusChanged && !!lastEntry && tsToYYYYMMDD(lastEntry.ts) !== formStatusDate;

  if (statusChanged) {
    return { timeline: [...prevTl, { status: formStatus, ts: statusTs }], lastUpdatedTs: statusTs };
  }
  if (dateCorrected) {
    return { timeline: [...prevTl.slice(0, -1), { ...lastEntry, ts: statusTs }], lastUpdatedTs: statusTs };
  }
  return { timeline: prevTl, lastUpdatedTs: now };
}
