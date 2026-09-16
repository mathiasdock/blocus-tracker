# Planning exam compatibility — Phase 1

## Read model

`lib/planningExams.mjs` combines the user's `exams` rows and `courses.exam_date`.
Planning's calendar, Today, details, revision list and ICS export consume this
same normalized list. No migration, backfill or write-on-read occurs.

- Structured rows keep their real ID, name, time and location.
- A structured row shadows a legacy date only for the **same course ID and date**.
- Distinct structured IDs remain distinct, even with identical course/date/name.
  Repeated copies of the same ID are deduplicated.
- An unmatched valid course date becomes a date-only event, including archived
  courses. Name/time/location remain null; the UI shows the existing course name.
- Divergent dates are both preserved. No title matching, guessed dates or guessed
  exam names. Invalid date strings are excluded, not silently coerced.
- Failed course/exam reads show a retry warning and retain previously loaded data
  for that source. The UI must not claim that a failed read means no exams.

## Writes

New exams and structured edits still use `exams`. Editing a legacy date updates
only `courses.exam_date` using owner + course + old-date filters (compare-and-set).
Synthetic `course-date:*` IDs never go to the exams table.

Deleting the last structured event matching a course's legacy date first clears
that exact legacy date, then deletes the event. Otherwise the deleted event would
return as a fallback. Other same-course/day structured events retain the date.
Deleting a date-only event clears only the legacy field.

Writes are serialized within the Planning instance. A stale legacy date or failed
write reports an error. These two table operations are **not transactional**:
if clearing succeeds but deletion fails, the structured event remains visible and
retryable. Concurrent edits across clients are not a global reconciliation system.
Changing a structured exam's date/course does not rewrite independent legacy data;
any remaining known legacy date stays visible for explicit correction.

## Limits and legacy

Timer/course flows still write the legacy course date; Timer is untouched.
Other readers (profile, push/mission flows, academic spaces) are not globally
migrated by this change. A future canonical write model requires its own task.
No production data was changed during validation.

## Visual contract

Planning uses dedicated exam ink/rail/surface/border tokens, not danger or pause.
Short leading rail + calendar glyph + label/count identify the event structurally.
Narrow Month cells retain glyph/count; full details are one tap away. Course hue
is secondary to the exam treatment. No past-date slash or course-color diagonal.

## Deferred

Week workload redesign, Month weighting by planned minutes, dense-day aggregation,
supporting-section composition and possible Study Blocks belong to Phase 2.
