# CatchUp Prototype UX Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Today-to-AI-Mate shortcuts, make every displayed schedule editable in place, and correct the onboarding and mobile visual details from the approved screenshots.

**Architecture:** Extend the existing `AiMateProvider` as the single owner of draft prompts and contextual chips. Store edits to Upload-derived schedules in the shared prototype reducer so Today and Month stay synchronized, while retaining the current local override behavior for mock Google events. Keep visual changes scoped to the existing feature stylesheets.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, Vite, CSS

## Global Constraints

- Do not modify `DATA_MODEL.md` or `API_SPEC.md`.
- Plan generation uses the user-requested date as Day 1 and covers exactly 7 days; no automatic weekly generation is used.
- AI Mate plan adjustments remain limited to 10 per day.
- Prompt shortcuts and Prompt Chips populate the composer but never send automatically.
- Calendar colors remain limited to `#C7B9FA`, `#E9E0FF`, `#F8B1FB`, `#FEE8FF`, `#A5D1FF`, and `#D9F0FF`.
- Editing a course color applies to every schedule in the same course category.
- Tests use only the existing anonymous demo data.

---

### Task 1: Shared Upload-derived schedule editing

**Files:**
- Modify: `src/store/prototypeReducer.ts`
- Modify: `src/store/prototypeReducer.test.ts`
- Modify: `src/features/calendar/ScheduleEditorDialog.tsx`
- Modify: `src/features/calendar/ScheduleEditorDialog.test.tsx`

**Interfaces:**
- Produces: `PrototypeAction` variant `{ type: "extraction/itemUpdated"; payload: { id; title; date; time } }`.
- Produces: `ScheduleEditorDialog` without a `readOnly` prop; every rendered editor calls `onSave`.
- Preserves immutable Upload fields including `documentId`, `type`, `source`, confidence, and review status.

- [ ] **Step 1: Write failing reducer and editor tests**

```tsx
it("updates editable fields on one extracted schedule", () => {
  const state = prototypeReducer(createInitialPrototypeState(), {
    type: "extraction/applied",
    payload: extraction,
  });
  const next = prototypeReducer(state, {
    type: "extraction/itemUpdated",
    payload: { id: "item-1", title: "수정된 일정", date: "2026-07-24", time: "14:00" },
  });
  expect(next.extractedItemsById["item-1"]).toMatchObject({
    title: "수정된 일정",
    date: "2026-07-24",
    time: "14:00",
  });
});

it("saves an Upload-derived schedule in the shared editor", async () => {
  const onSave = vi.fn();
  render(
    <MemoryRouter>
      <ScheduleEditorDialog
        initialDraft={draft}
        categoryKind="course"
        categoryColor="#C7B9FA"
        onSave={onSave}
        onColorChange={vi.fn()}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Upload에서 수정")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(onSave).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:
`/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run src/store/prototypeReducer.test.ts src/features/calendar/ScheduleEditorDialog.test.tsx`

Expected: FAIL because `extraction/itemUpdated` is not accepted and the editor still renders the Upload link in read-only mode.

- [ ] **Step 3: Implement the reducer action and always-editable dialog**

```ts
type EditableExtractedItemFields = Pick<ExtractedItem, "title" | "date" | "time">;

// action
| { type: "extraction/itemUpdated"; payload: { id: ExtractedItemId } & EditableExtractedItemFields }

// reducer
case "extraction/itemUpdated": {
  const item = state.extractedItemsById[action.payload.id];
  if (!item) return state;
  return {
    ...state,
    extractedItemsById: {
      ...state.extractedItemsById,
      [item.id]: { ...item, ...action.payload },
    },
  };
}
```

Remove the `readOnly` prop, disabled fields, conditional heading, and `Upload에서 수정` link from `ScheduleEditorDialog`. Keep the existing title/time validation and save button.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command again. Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/store/prototypeReducer.ts src/store/prototypeReducer.test.ts src/features/calendar/ScheduleEditorDialog.tsx src/features/calendar/ScheduleEditorDialog.test.tsx
git commit -m "feat(calendar): edit extracted schedules in place"
```

### Task 2: AI Mate drafts and contextual Prompt Chips

**Files:**
- Modify: `src/features/ai-mate/AiMateProvider.tsx`
- Modify: `src/features/ai-mate/AiMateLayer.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/features/ai-mate/AiMateFlow.test.tsx`

**Interfaces:**
- Produces: `AiMatePromptChip = { label: string; draft: string }`.
- Produces: `openWithDraft(draft: string, chips?: AiMatePromptChip[]): void`.
- Produces: `promptChips: AiMatePromptChip[]` and `selectPromptChip(chip): void` from `useAiMate()`.

- [ ] **Step 1: Write failing AI Mate tests**

```tsx
function AiMateHarness() {
  const { openWithDraft } = useAiMate();
  return (
    <button type="button" onClick={() => openWithDraft("", [
      { label: "할 일 추천이유", draft: "ERD 실습 준비를 추천한 이유를 알려줘" },
    ])}>
      맥락 열기
    </button>
  );
}

it("shows contextual chips that only update the composer", async () => {
  render(
    <MemoryRouter>
      <PrototypeStoreProvider>
        <AiMateProvider>
          <AiMateHarness />
          <AiMateLayer showCoachmark={false} />
        </AiMateProvider>
      </PrototypeStoreProvider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "맥락 열기" }));
  await user.click(screen.getByRole("button", { name: "할 일 추천이유" }));
  expect(screen.getByLabelText("AI Mate 메시지")).toHaveValue("ERD 실습 준비를 추천한 이유를 알려줘");
  expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();
});

it("does not render message timestamps", () => {
  render(<App initialEntries={["/today"]} />);
  fireEvent.click(screen.getByRole("button", { name: "AI Mate 열기" }));
  expect(screen.getByRole("dialog", { name: "AI Mate" }).querySelector("time")).toBeNull();
});
```

- [ ] **Step 2: Run the AI Mate test and verify RED**

Run:
`/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run src/features/ai-mate/AiMateFlow.test.tsx`

Expected: FAIL because contextual chips are not in the provider and message `<time>` elements are still rendered.

- [ ] **Step 3: Add contextual chip state and remove timestamps**

```ts
export interface AiMatePromptChip {
  label: string;
  draft: string;
}

const [promptChips, setPromptChips] = useState<AiMatePromptChip[]>([]);
const openWithDraft = useCallback((nextDraft: string, chips: AiMatePromptChip[] = []) => {
  setDraft(nextDraft);
  setPromptChips(chips);
  setOpen(true);
}, []);
const selectPromptChip = useCallback((chip: AiMatePromptChip) => setDraft(chip.draft), []);
```

Wrap `setOpen` so closing the panel clears `promptChips`. Render chip buttons between `.ai-conversation` and `.ai-composer`. Delete `formatTime()` and both message `<time>` elements.

- [ ] **Step 4: Run the AI Mate test and verify GREEN**

Run the Task 2 command again. Expected: all AI Mate tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/features/ai-mate/AiMateProvider.tsx src/features/ai-mate/AiMateLayer.tsx src/styles/global.css src/features/ai-mate/AiMateFlow.test.tsx
git commit -m "feat(ai-mate): add contextual prompt chips"
```

### Task 3: Today shortcuts, editable schedules, and mobile spacing

**Files:**
- Modify: `src/features/today/TodayPage.tsx`
- Modify: `src/features/today/today.css`
- Modify: `src/features/today/TodayFlow.test.tsx`

**Interfaces:**
- Consumes: `useAiMate().openWithDraft(draft, chips)` from Task 2.
- Consumes: reducer action `extraction/itemUpdated` from Task 1.
- Produces: `formatPromptDate("2026-07-23") === "7/23"` inside Today presentation logic.

- [ ] **Step 1: Write failing Today interaction tests**

```tsx
fireEvent.click(screen.getByRole("button", { name: "계획 생성하기" }));
expect(screen.getByRole("dialog", { name: "AI Mate" })).toBeInTheDocument();
expect(screen.getByLabelText("AI Mate 메시지")).toHaveValue("이번 주 계획을 생성해줘");
expect(screen.queryByLabelText("내 메시지")).not.toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: /ERD 실습 준비.*AI Mate/ }));
expect(screen.getByRole("button", { name: "할 일 추천이유" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "할 일 조정" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "7/23일 할 일 추가" })).toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: "계획 조정" }));
expect(screen.getByLabelText("AI Mate 메시지")).toHaveValue("7/23일 계획을 조정해줘");
```

```tsx
expect(screen.getByRole("button", { name: "추가" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /UX 리서치 보고서 일정 수정/ }));
expect(screen.getByRole("dialog", { name: "일정 편집" })).toBeInTheDocument();
fireEvent.change(screen.getByRole("textbox", { name: "제목" }), {
  target: { value: "UX 보고서 제출" },
});
fireEvent.click(screen.getByRole("button", { name: "저장" }));
expect(screen.getByText("UX 보고서 제출")).toBeInTheDocument();
```

- [ ] **Step 2: Run Today tests and verify RED**

Run:
`/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run src/features/today/TodayFlow.test.tsx`

Expected: FAIL because the plan CTA, todo prompt chips, empty-day adjustment button, and Upload schedule save do not exist.

- [ ] **Step 3: Implement Today interactions**

- Import and use `useAiMate`.
- Add `계획 생성하기` to the no-plan card and call `openWithDraft("이번 주 계획을 생성해줘")`.
- Render the todo content as a button separate from its checkbox. Open with an empty initial draft and the three approved chips.
- Add `계획 조정` to the selected-date empty state and call `openWithDraft(`${formatPromptDate(selectedDate)}일 계획을 조정해줘`)`.
- Change `일정 추가` to `추가`.
- Save `editingItem` through `extraction/itemUpdated`, mapping the editor start time to `ExtractedItem.time`.
- Remove `readOnly` when rendering `ScheduleEditorDialog`.
- Add top safe spacing to `.today-page` and keep the briefing headline on one line at the prototype mobile width without overlapping the character.

- [ ] **Step 4: Run Today tests and verify GREEN**

Run the Task 3 command again. Expected: all Today tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/features/today/TodayPage.tsx src/features/today/today.css src/features/today/TodayFlow.test.tsx
git commit -m "feat(today): restore contextual AI shortcuts"
```

### Task 4: Month in-place editing for extracted schedules

**Files:**
- Modify: `src/features/month/MonthScheduleDialog.tsx`
- Modify: `src/features/month/MonthPage.tsx`
- Modify: `src/features/month/monthSelectors.ts`
- Modify: `src/features/month/MonthPage.test.tsx`

**Interfaces:**
- Consumes: `extraction/itemUpdated` from Task 1.
- Produces: `onSave(draft, target?: { eventId?: string; extractedItemId?: string })` between the Month dialog and page.

- [ ] **Step 1: Write failing Month tests**

```tsx
await user.click(screen.getByRole("button", { name: /UX 리서치 보고서.*선택/ }));
expect(screen.getByRole("dialog", { name: "일정 편집" })).toBeInTheDocument();
await user.clear(screen.getByLabelText("제목"));
await user.type(screen.getByLabelText("제목"), "UX 보고서 제출");
await user.click(screen.getByRole("button", { name: "저장" }));
expect(screen.getByText("UX 보고서 제출")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "추가" })).toBeInTheDocument();
```

- [ ] **Step 2: Run Month tests and verify RED**

Run:
`/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run src/features/month/MonthPage.test.tsx`

Expected: FAIL because extracted schedules are read-only and the button still says `일정 추가`.

- [ ] **Step 3: Implement Month target-aware save**

- Pass `selectedItem.extractedItemId` through the dialog save target; add that ID to `MonthScheduleItem` when the source is Upload.
- Dispatch `extraction/itemUpdated` for an extracted target, preserving all non-editable source fields.
- Continue using event update/local override for Calendar events and event creation when there is no target.
- Remove `readOnly` from the shared editor call and change the add button text to `추가`.

- [ ] **Step 4: Run Month tests and verify GREEN**

Run the Task 4 command again. Expected: all Month tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/features/month/MonthScheduleDialog.tsx src/features/month/MonthPage.tsx src/features/month/MonthPage.test.tsx src/features/month/monthSelectors.ts
git commit -m "feat(month): edit extracted schedules in place"
```

### Task 5: Onboarding visual correction and product documentation

**Files:**
- Modify: `src/features/onboarding/CalendarOnboardingPage.tsx`
- Modify: `src/features/onboarding/onboarding.css`
- Modify: `src/features/onboarding/CalendarOnboardingFlow.test.tsx`
- Modify: `IA.md`
- Modify: `USER_FLOW.md`
- Modify: `SCREEN_SPEC.md`
- Modify: `ONBOARDING_DESIGN.md`
- Modify: `TODAY_DESIGN.md`
- Modify: `AIMATE_DESIGN.md`
- Modify: `MONTH_DESIGN.md`

**Interfaces:**
- Keeps the supplied `src/assets/google-calendar-blue.png` asset.
- Produces separate icon-frame elements that cover the connector line at both ends.

- [ ] **Step 1: Write the failing onboarding structure test**

```tsx
expect(screen.getByTestId("google-calendar-icon-frame")).toContainElement(
  screen.getByRole("img", { name: "Google Calendar" }),
);
expect(screen.getByTestId("calendar-connector")).toHaveAttribute("aria-hidden", "true");
```

- [ ] **Step 2: Run onboarding tests and verify RED**

Run:
`/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run src/features/onboarding/CalendarOnboardingFlow.test.tsx`

Expected: FAIL because the named frame and connector elements are absent.

- [ ] **Step 3: Correct the icon frame, centering, and connector layering**

- Give the Google frame the same light-purple border family as the CatchUp frame.
- Center the image with flex/grid alignment and fixed square image sizing.
- Render the connector as a separate middle element whose width ends before both frames.
- Keep both icon frames above the connector via stacking context and opaque backgrounds.

- [ ] **Step 4: Update product and screen documentation**

Document the restored plan CTA, draft-only Prompt Chips, in-place Upload schedule editing, removed message times, `추가` copy, safe top spacing, and onboarding icon treatment. Do not touch `DATA_MODEL.md` or `API_SPEC.md`.

- [ ] **Step 5: Run onboarding tests and documentation consistency checks**

Run:
`/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run src/features/onboarding/CalendarOnboardingFlow.test.tsx`

Run:
`rg -n "Upload에서 수정|일정 추가|메시지 시간" IA.md USER_FLOW.md SCREEN_SPEC.md ONBOARDING_DESIGN.md TODAY_DESIGN.md AIMATE_DESIGN.md MONTH_DESIGN.md`

Expected: onboarding tests pass and no stale required-behavior text remains.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/features/onboarding/CalendarOnboardingPage.tsx src/features/onboarding/onboarding.css src/features/onboarding/CalendarOnboardingFlow.test.tsx IA.md USER_FLOW.md SCREEN_SPEC.md ONBOARDING_DESIGN.md TODAY_DESIGN.md AIMATE_DESIGN.md MONTH_DESIGN.md
git commit -m "fix(onboarding): refine calendar connection visual"
```

### Task 6: Full verification and browser design QA

**Files:**
- Create: `design-qa.md`
- Modify only if QA finds a P0, P1, or P2 issue: feature source, tests, or CSS already listed above.

**Interfaces:**
- Consumes the complete prototype from Tasks 1–5.
- Produces a passing automated suite, production build, and `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Run the full automated suite**

```bash
/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run
/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc -b --pretty false
/Users/air15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vite/bin/vite.js build
```

Expected: 0 test failures, typecheck exit 0, build exit 0.

- [ ] **Step 2: Run the local prototype and capture required states**

Open the prototype at mobile width and capture:

- Google Calendar onboarding connection graphic
- Today no-plan state with `계획 생성하기`
- Today planned state with single-line briefing
- Todo card AI Mate Prompt Chips
- Empty-date `계획 조정` draft
- Today and Month Upload schedule editor
- AI Mate messages without timestamps

- [ ] **Step 3: Write and apply the design QA result**

Create `design-qa.md` with the compared viewport, screenshots inspected, findings grouped by P0–P3, fixes applied, and the exact final line `final result: passed`. Fix and recapture every P0–P2 issue before marking it passed.

- [ ] **Step 4: Verify intended git scope**

Run:

```bash
git diff --check
git status --short
```

Expected: only the approved implementation/docs plus the user's pre-existing `DATA_MODEL.md` and `API_SPEC.md` changes appear; the latter two remain unstaged.

- [ ] **Step 5: Commit QA evidence and push the existing PR branch**

```bash
git add design-qa.md
git commit -m "test: document prototype design qa"
git push origin Upload_AImate_Screen
```

Update draft PR #2 with the new commits and report the running prototype URL.
