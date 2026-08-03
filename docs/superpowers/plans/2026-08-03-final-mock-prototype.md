# CatchUp Final Mock Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved onboarding, Today, AI Mate, and Month design changes to the working React mock prototype and align the product documentation.

**Architecture:** Keep `CalendarEvent` free of presentation-only color data and store category-level palette overrides in `PrototypeState`. Derive one category key per course or the shared personal category, reuse one schedule editor between Today and Month, and render Month title chips from the same schedule view model. Preserve the existing mock-only service boundaries and reducer-driven state.

**Tech Stack:** React 19, TypeScript 7, React Router 7, Vitest, Testing Library, Vite, CSS.

## Global Constraints

- Do not modify `DATA_MODEL.md` or `API_SPEC.md`.
- Weekly plans are generated only once per configured week, Monday through Sunday.
- AI Mate plan adjustments are limited to 10 successful requests per day.
- Todo content, date, time, and priority are changed only through AI Mate; calendar schedules may be added or edited directly.
- Use only `#C7B9FA`, `#E9E0FF`, `#F8B1FB`, `#FEE8FF`, `#A5D1FF`, and `#D9F0FF` for Month category chips.
- Selecting a course color updates every schedule for that course; all personal schedules share one category color.
- Use only anonymized mock student data and sample schedules.
- Preserve unrelated worktree changes.

---

### Task 1: Category Color Domain and Reducer State

**Files:**
- Create: `src/features/calendar/calendarColors.ts`
- Create: `src/features/calendar/calendarColors.test.ts`
- Modify: `src/store/prototypeReducer.ts`
- Modify: `src/store/prototypeReducer.test.ts`

**Interfaces:**
- Produces: `CALENDAR_CATEGORY_COLORS`, `CalendarCategoryColor`, `getCourseCategoryKey(courseName)`, `PERSONAL_CATEGORY_KEY`, `getDefaultCategoryColor(categoryKey)`, and `resolveCategoryColor(categoryKey, overrides)`.
- Produces: `PrototypeState.categoryColorByKey: Record<string, CalendarCategoryColor>` and action `calendar/categoryColorSet` with `{ categoryKey, color }`.
- Consumes: Existing `PrototypeState`, `PrototypeAction`, and reducer test conventions.

- [ ] **Step 1: Write failing color helper tests**

```ts
expect(CALENDAR_CATEGORY_COLORS).toEqual([
  "#C7B9FA", "#E9E0FF", "#F8B1FB", "#FEE8FF", "#A5D1FF", "#D9F0FF",
]);
expect(getCourseCategoryKey("데이터베이스")).toBe("course:데이터베이스");
expect(resolveCategoryColor("course:데이터베이스", {})).toBe(
  getDefaultCategoryColor("course:데이터베이스"),
);
expect(resolveCategoryColor("course:데이터베이스", {
  "course:데이터베이스": "#A5D1FF",
})).toBe("#A5D1FF");
```

- [ ] **Step 2: Run the helper test and confirm failure**

Run: `pnpm test -- src/features/calendar/calendarColors.test.ts`

Expected: FAIL because `calendarColors.ts` does not exist.

- [ ] **Step 3: Implement the exact palette and deterministic category resolver**

Use a stable character-code hash modulo six for course defaults and reserve `PERSONAL_CATEGORY_KEY = "personal"`. Validate overrides by typing values as the six-color union rather than accepting arbitrary strings.

- [ ] **Step 4: Add failing reducer test for category-wide color updates**

```ts
const next = prototypeReducer(createInitialPrototypeState(), {
  type: "calendar/categoryColorSet",
  payload: { categoryKey: "course:데이터베이스", color: "#A5D1FF" },
});
expect(next.categoryColorByKey["course:데이터베이스"]).toBe("#A5D1FF");
```

- [ ] **Step 5: Add reducer state and action, then run focused tests**

Initialize `categoryColorByKey` to `{}`. The reducer must update only the supplied category key and preserve every other state field.

Run: `pnpm test -- src/features/calendar/calendarColors.test.ts src/store/prototypeReducer.test.ts`

Expected: PASS.

---

### Task 2: Shared Schedule Editor

**Files:**
- Create: `src/features/calendar/ScheduleEditorDialog.tsx`
- Create: `src/features/calendar/scheduleEditor.css`
- Create: `src/features/calendar/ScheduleEditorDialog.test.tsx`
- Modify: `src/features/month/MonthScheduleDialog.tsx`
- Modify: `src/features/month/MonthPage.tsx`

**Interfaces:**
- Consumes: `CalendarEvent`, `CalendarCategoryColor`, the Task 1 palette, and existing Month schedule items.
- Produces: `ScheduleDraft = Pick<CalendarEvent, "title" | "date" | "startTime" | "endTime" | "isAllDay" | "eventType">`.
- Produces: `ScheduleEditorDialog` props `{ mode, initialDraft, categoryKey, categoryColor, isReadOnlyAcademic, onSave, onColorChange, onClose }`.

- [ ] **Step 1: Write failing shared editor tests**

Test that the dialog:

```ts
expect(screen.getAllByRole("radio", { name: /색상/ })).toHaveLength(6);
expect(screen.getByText("같은 과목의 모든 일정에 적용돼요.")).toBeInTheDocument();
await user.clear(screen.getByRole("textbox", { name: "제목" }));
await user.click(screen.getByRole("button", { name: "저장" }));
expect(screen.getByRole("alert")).toHaveTextContent("일정 제목");
```

Also test that academic upload items expose readonly details, show `Upload에서 수정`, and still permit category color selection.

- [ ] **Step 2: Run the editor test and confirm failure**

Run: `pnpm test -- src/features/calendar/ScheduleEditorDialog.test.tsx`

Expected: FAIL because the shared component does not exist.

- [ ] **Step 3: Implement the dialog and validation**

Validate trimmed title and `endTime > startTime` for editable schedules. Render the six palette values as labeled radio buttons with `aria-checked`. For readonly academic details, disable title/date/time/type inputs and render an `Upload에서 수정` link to `/upload`.

- [ ] **Step 4: Replace Month's inline form with the shared editor**

Keep the selected-date schedule list in `MonthScheduleDialog`. Make each schedule row a full-width button. Selecting an event opens the editor with existing values; selecting an upload item opens readonly academic details plus editable category color. Keep the standalone `일정 추가` button.

- [ ] **Step 5: Run focused editor and Month tests**

Run: `pnpm test -- src/features/calendar/ScheduleEditorDialog.test.tsx src/features/month/MonthPage.test.tsx`

Expected: PASS after updating Month assertions from pencil buttons to schedule-row selection.

---

### Task 3: Month Title Chips and Category Colors

**Files:**
- Modify: `src/features/month/monthSelectors.ts`
- Modify: `src/features/month/monthModel.test.ts`
- Modify: `src/features/month/MonthCalendar.tsx`
- Modify: `src/features/month/MonthPage.tsx`
- Modify: `src/features/month/month.css`
- Modify: `src/features/month/MonthPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 category helpers and `PrototypeState.categoryColorByKey`.
- Extends: `MonthScheduleItem` with `categoryKey` and `courseName?: string`.
- Produces: calendar chips that use `resolveCategoryColor(item.categoryKey, categoryColorByKey)`.

- [ ] **Step 1: Replace the dot-only test with failing title-chip assertions**

```ts
expect(screen.getByText("팀 프로젝트 회의")).toBeInTheDocument();
expect(container.querySelectorAll("[data-calendar-dot]")).toHaveLength(0);
expect(screen.getByText("+1")).toBeInTheDocument();
```

Add a test that changes the `데이터베이스` color through one academic schedule and asserts every visible `데이터베이스` chip uses the chosen color.

- [ ] **Step 2: Run Month tests and confirm the old dot UI fails**

Run: `pnpm test -- src/features/month/MonthPage.test.tsx`

Expected: FAIL because titles are currently hidden and dots are rendered.

- [ ] **Step 3: Extend Month schedule view models with category keys**

Upload-derived schedules use `getCourseCategoryKey(item.courseName)`. Both Google and CatchUp personal schedules use `PERSONAL_CATEGORY_KEY`; class calendar events use a stable course-like key based on their title only when no explicit course name exists.

- [ ] **Step 4: Render bounded title chips**

Render up to two event title chips per date cell on compact mobile widths and three on wider layouts, followed by `+N` for overflow. Use one-line ellipsis and dark text. Remove `getMonthDotCount` and all `[data-calendar-dot]` markup.

- [ ] **Step 5: Wire category color save to the reducer**

Dispatch `calendar/categoryColorSet` from the Month detail/editor flow. A course change must update every chip with the same `categoryKey`; personal changes must update both Google and CatchUp personal items.

- [ ] **Step 6: Run Month tests**

Run: `pnpm test -- src/features/month/MonthPage.test.tsx src/features/month/monthModel.test.ts`

Expected: PASS.

---

### Task 4: Today Hierarchy, Todo Metadata, and Schedule Editing

**Files:**
- Modify: `src/features/today/TodayPage.tsx`
- Modify: `src/features/today/today.css`
- Modify: `src/features/today/TodayFlow.test.tsx`
- Modify: `src/features/today/todaySelectors.ts`

**Interfaces:**
- Consumes: `ScheduleEditorDialog`, existing `TodayScheduleViewModel`, `calendar/eventCreated`, `calendar/eventUpdated`, and `calendar/categoryColorSet`.
- Produces: `formatEstimatedDuration(minutes)` returning `30M`, `1H`, or `2.5H`.

- [ ] **Step 1: Write failing Today assertions for removed and added controls**

Assert that:

```ts
expect(screen.queryByText("오늘도 따라잡아볼까요? 👋")).not.toBeInTheDocument();
expect(screen.queryByText(/개$/)).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /할 일.*추가/ })).not.toBeInTheDocument();
expect(screen.queryByText("추천 이유 보기")).not.toBeInTheDocument();
expect(screen.queryByText(/우선순위/)).not.toBeInTheDocument();
expect(screen.getByText("1H")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "일정 추가" })).toBeInTheDocument();
```

Add a flow test that clicks an existing schedule card, edits its title, saves, and sees the new title. Add a flow that creates a schedule for the selected date.

- [ ] **Step 2: Run Today tests and confirm failure**

Run: `pnpm test -- src/features/today/TodayFlow.test.tsx`

Expected: FAIL on the existing greeting, counts, todo buttons, and priority metadata.

- [ ] **Step 3: Implement the approved Today hierarchy and copy**

Remove the greeting header. Set selected date background to `#8C6EF6` with white numerals and retain a purple outline for today when not selected. Use the briefing copy exactly:

```text
4주 일정을 고려해 중요한 일부터 정리했어요.
우리 오늘도 같이 하나씩 따라잡아봐요!
```

- [ ] **Step 4: Simplify todo cards**

Keep checkbox, course, title, formatted duration, and optional due date. Remove priority, recommendation details, per-todo edit, todo add, and section counts. In empty-plan state show only the AI Mate guidance text and no inline generation button.

- [ ] **Step 5: Add Today schedule add/edit flows**

Render `일정 추가` beside the schedule heading. Make each schedule card a button that opens the shared editor. Calendar events are editable; upload-derived schedules open readonly details with the Upload route and category color control. Save created or CatchUp events through the reducer; retain the existing local mock override behavior for Google events.

- [ ] **Step 6: Run Today tests**

Run: `pnpm test -- src/features/today/TodayFlow.test.tsx`

Expected: PASS.

---

### Task 5: Google Calendar Onboarding Asset and Copy

**Files:**
- Create: `src/assets/google-calendar-blue.png` from the user-provided reference image
- Modify: `src/features/onboarding/CalendarOnboardingPage.tsx`
- Modify: `src/features/onboarding/onboarding.css`
- Modify: `src/features/onboarding/CalendarOnboardingFlow.test.tsx`

**Interfaces:**
- Consumes: `/var/folders/tm/30ypc7l93s35v_my7pw1wyww0000gn/T/codex-clipboard-7a06e728-4de6-43f7-beed-6ed47dcd943b.png`.
- Produces: bundled decorative Google Calendar icon asset.

- [ ] **Step 1: Update tests to require the new image and absent subtitle**

```ts
expect(screen.getByRole("img", { name: "Google Calendar" })).toBeInTheDocument();
expect(screen.queryByText(/개인 일정과 수업 시간을 함께 반영해요/)).not.toBeInTheDocument();
```

Update post-navigation assertions to target the Today date selector rather than the removed greeting.

- [ ] **Step 2: Run onboarding tests and confirm failure**

Run: `pnpm test -- src/features/onboarding/CalendarOnboardingFlow.test.tsx`

Expected: FAIL because the existing icon is CSS-drawn and the subtitle is present.

- [ ] **Step 3: Add the asset and update markup/CSS**

Copy the exact user-provided icon into `src/assets/google-calendar-blue.png`, import it in the component, remove the subtitle paragraph, and replace `.google-calendar-mark` with an image constrained to the existing 72px illustration slot.

- [ ] **Step 4: Run onboarding tests**

Run: `pnpm test -- src/features/onboarding/CalendarOnboardingFlow.test.tsx`

Expected: PASS.

---

### Task 6: AI Mate Proactive Introduction and Completion Guidance

**Files:**
- Modify: `src/features/ai-mate/AiMateProvider.tsx`
- Modify: `src/features/ai-mate/AiMateLayer.tsx`
- Modify: `src/application/mockPlanEngine.ts`
- Modify: `src/application/mockPlanEngine.test.ts`
- Modify: `src/features/ai-mate/AiMateFlow.test.tsx`

**Interfaces:**
- Produces: two initial assistant messages present before any user input.
- Produces: successful plan generation response containing completion, customization, adjustment/addition, and recommendation-reason guidance.

- [ ] **Step 1: Write failing proactive-message tests**

After opening AI Mate, assert the two exact messages:

```text
안녕하세요! 여러분의 AI Mate 캐치예요.
이번 주 계획을 요청할 때 원하는 공부 방식이나 개인 요구사항도 함께 알려주세요. 계획에 반영해드릴게요.
```

After generating a plan, assert the response includes `바꾸거나 추가하고 싶은 할 일` and `추천한 이유도 물어볼 수 있어요`.

- [ ] **Step 2: Run AI Mate tests and confirm failure**

Run: `pnpm test -- src/features/ai-mate/AiMateFlow.test.tsx src/application/mockPlanEngine.test.ts`

Expected: FAIL because the panel currently renders an empty placeholder and the success response lacks follow-up guidance.

- [ ] **Step 3: Initialize assistant message state and remove empty placeholder**

Create deterministic initial messages with stable IDs, assistant role, sent status, and mock clock timestamps. Keep them as normal conversation bubbles. Remove the `messages.length === 0` placeholder branch.

- [ ] **Step 4: Update successful plan copy**

Return:

```text
이번 주 계획을 만들었어요. 요청한 공부 방식도 함께 반영했어요.
바꾸거나 추가하고 싶은 할 일이 있으면 말씀해주세요. 각 할 일을 추천한 이유도 물어볼 수 있어요.
```

Preserve plan data, one-generation-per-week rules, retry behavior, and daily adjustment accounting.

- [ ] **Step 5: Run AI Mate tests**

Run: `pnpm test -- src/features/ai-mate/AiMateFlow.test.tsx src/application/mockPlanEngine.test.ts`

Expected: PASS.

---

### Task 7: Source-of-Truth and Screen Design Documentation

**Files:**
- Modify: `PRD.md`
- Modify: `README.md`
- Modify: `IA.md`
- Modify: `USER_FLOW.md`
- Modify: `SCREEN_SPEC.md`
- Modify: `ONBOARDING_DESIGN.md`
- Modify: `TODAY_DESIGN.md`
- Modify: `AIMATE_DESIGN.md`
- Modify: `MONTH_DESIGN.md`

**Interfaces:**
- Consumes: approved design spec and implemented behavior from Tasks 1–6.
- Produces: consistent MVP scope, flows, copy, palette, and interaction documentation.

- [ ] **Step 1: Update PRD and README scope**

Move Month category colors and title chips into the first MVP. Remove the old statement that category colors are post-initial-implementation. Keep confirm-needed visual distinction as a later consideration. State that course color changes apply to all schedules in that course.

- [ ] **Step 2: Update IA and user flows**

Document Today schedule-card editing, direct schedule addition, AI-only todo changes, AI Mate proactive messages, post-generation guidance, Month title chips, and category-wide color editing.

- [ ] **Step 3: Update screen and feature design specs**

Record the exact removed controls, approved copy, `#8C6EF6` selected date, duration formats, six palette values, `+N` overflow, direct schedule editor behavior, and readonly Upload-derived academic details.

- [ ] **Step 4: Verify excluded files are untouched**

Run: `git diff -- DATA_MODEL.md API_SPEC.md`

Expected: only the user's pre-existing changes are present; this implementation introduces no additional edits to either file.

- [ ] **Step 5: Scan documents for stale contradictions**

Run:

```bash
rg -n "점 또는|점 1개|다양한 카테고리 색상을 쓰지|초기 구현 이후.*색상|오늘도 따라잡아볼까요|추천 이유 보기|우선순위.*Today" PRD.md README.md IA.md USER_FLOW.md SCREEN_SPEC.md ONBOARDING_DESIGN.md TODAY_DESIGN.md AIMATE_DESIGN.md MONTH_DESIGN.md
```

Expected: no stale requirement remains unless explicitly described as removed behavior.

---

### Task 8: Full Verification and Visual QA

**Files:**
- Modify only files needed to fix failures found in this task, excluding `DATA_MODEL.md` and `API_SPEC.md`.

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: verified final mock prototype.

- [ ] **Step 1: Run all automated checks**

Run: `pnpm test`

Expected: all tests PASS.

Run: `pnpm typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `pnpm build`

Expected: exit 0 and Vite build output.

- [ ] **Step 2: Start the prototype for visual inspection**

Run: `pnpm dev --host 127.0.0.1`

Expected: Vite prints a local URL and remains running.

- [ ] **Step 3: Inspect required screens and interactions**

Check mobile and desktop widths for:

- onboarding icon and missing subtitle;
- Today's purple selected date, concise briefing, simplified todo cards, schedule add/edit;
- AI Mate's two proactive messages and post-generation guidance;
- Month title chips, `+N`, six-color picker, course-wide and personal-wide color updates.

- [ ] **Step 4: Confirm worktree scope**

Run: `git status --short` and `git diff --stat`.

Expected: implementation and documentation files only, plus the user's pre-existing `DATA_MODEL.md` and `API_SPEC.md` changes. No generated test artifacts or secrets are present.
