# Task 5 Report — Month route, schedule dialog, URL and focus state machine

## Status

PASS

Implementation commit: `7a40b79` (`feat: integrate month schedule sheet`)

## RED / GREEN evidence

- RED 1: `MonthPage.test.tsx` failed to resolve the intentionally missing
  `./MonthPage` module.
- GREEN 1: 3 focused tests passed for canonical month replacement, replace-only
  month controls, and the date-selection sheet PUSH contract.
- RED 2: the expanded focused suite reported 7 failures for the not-yet-built
  edit, delete, failure retry, dirty-intent, and focus-return behavior.
- GREEN 2: `MonthPage.test.tsx` passed all 14 integration tests.
- Typecheck: `bun node_modules/typescript/bin/tsc -b --pretty false` passed.
- Full suite: `bun node_modules/vitest/vitest.mjs run` passed
  (18 files, 99 tests).

The shell did not expose a `node` executable, so the installed Vitest and
TypeScript entry points were executed with Bun. No dependency was added.

## Files

- `src/app/App.tsx`
- `src/app/AppShell.tsx`
- `src/features/month/MonthCalendar.tsx`
- `src/features/month/MonthPage.tsx`
- `src/features/month/MonthScheduleDialog.tsx`
- `src/features/month/MonthPage.test.tsx`
- `src/features/month/month.css`
- `.superpowers/sdd/task-5-report.md`

## State-machine self-review

- Form state is explicitly `idle` (no active form), `creating`, or
  `editing(eventId)`.
- Pending intents explicitly distinguish router navigation, dismiss, create,
  edit, cancel-form, and delete.
- A clean intent executes immediately. A dirty intent renders one in-sheet
  discard confirmation.
- `계속 작성` resets a blocked router transition when necessary and otherwise
  resumes the draft unchanged.
- `버리기` executes only the captured intent. Only the router intent calls
  `blocker.proceed()`.
- Button, Escape, and backdrop dismiss paths share the origin-aware close
  callback.
- Inline delete preserves its row context on failure and disables conflicting
  row actions while confirming or deleting.
- Mutation success precedes every narrow calendar reducer dispatch.

## URL and focus checks

- Missing/invalid `month` is canonicalized with replace to `2026-07`.
- Previous, next, and today use replace.
- Date selection creates one PUSH entry with `{ fromMonth: true }`.
- Internal close uses history back; direct deep-link close removes
  `date/sheet` with replace.
- Draft date changes remain local before save.
- A moved update replaces `month/date`, keeps `sheet=schedule`, and preserves
  route state.
- Closing the sheet returns focus to the selected date button. Calendar chips
  use the same date-button focus target.
- `AiMateProvider` remains mounted while `AiMateLayer` is omitted only for the
  open Month schedule sheet.

## Concerns / follow-up

- jsdom 29 throws while computing accessible roles inside an open native
  `<dialog>` with the project styles. Dialog integration assertions therefore
  use label/text queries while still exercising `showModal()`, `cancel`, and
  focus behavior.
- The ExtractedItem handoff is intentionally represented only by the optional
  callback slot; Task 8 must wire navigation.
- No visual browser/device pass was performed in this task.
