# CatchUp Month 목 기능 프로토타입 구현계획

## 1. 문서 목적과 판정 상태

이 문서는 현재 CatchUp React 프로토타입에 Month 화면과 날짜별 일정 상세 바텀시트를 연결하기 위한 실행 계획이다. 구현자가 목업 이미지를 다시 보지 않아도 `MONTH_DESIGN.md`, `MONTHSPEC_DESIGN.md`와 현재 코드 구조를 기준으로 작업을 시작할 수 있도록 파일, 상태, 데이터 흐름, 테스트, 완료 조건을 정의한다.

- 현재 상태: 구현 전 엔지니어링 리뷰와 독립 리뷰 완료
- 구현 코드 변경: 이 문서 작성 단계에서는 없음
- 기준 브랜치: `Upload_AImate_Screen`
- 기준 커밋: `071b2e5`
- 계획 모드: `FULL_REVIEW`

## 2. 확인한 문서와 우선순위

다음 순서로 제품 문서를 확인했다.

1. `PRD.md`
2. `README.md`
3. `IA.md`
4. `USER_FLOW.md`
5. `SCREEN_SPEC.md`
6. `DESIGN_SYSTEM.md`
7. `MONTH_DESIGN.md`
8. `MONTHSPEC_DESIGN.md`

충돌 시 `PRD.md`와 `AGENTS.md`의 MVP 범위가 우선한다. 목업의 고정 날짜나 예시 일정은 데이터 계약이 아니라 시각 예시로 취급한다.

## 3. 현재 코드 구조와 재사용 자산

### 3.1 기술 스택

- React 19 + TypeScript
- React Router 7의 `createBrowserRouter` / `createMemoryRouter`
- Vite + pnpm
- 전역 prototype 상태: Context + `useReducer`
- 단위·컴포넌트 테스트: Vitest, jsdom, Testing Library
- 브라우저 테스트: Playwright 설정 존재, iPhone 13 프로젝트 사용 가능

### 3.2 What already exists: 재사용 가능한 구조

| 기존 자산 | Month에서의 사용 |
| --- | --- |
| `src/app/AppShell.tsx` | 공통 Outlet, 하단 Today/Month/Upload 탭, AI Mate 레이어 유지 |
| `src/store/PrototypeStore.tsx` | Month 일정 읽기와 CRUD dispatch |
| `src/store/prototypeReducer.ts` | CatchUp 일정 생성·수정·삭제 action 추가 |
| `src/domain/types.ts` | 기존 `CalendarEvent`, `ExtractedItem` 재사용 |
| `src/domain/selectors.ts` | 기존 calendar event selector 재사용 |
| `src/features/today/todaySelectors.ts` | CalendarEvent와 ExtractedItem 결합 방식 참고 |
| `src/features/upload/uploadReducer.ts` | 복합 폼 UI 상태를 명시적으로 전이하는 패턴 참고 |
| `src/ui/icons.tsx` | 현재 inline SVG 아이콘 방식 유지 |
| `src/styles/tokens.css` | 색상·타이포그래피·간격 토큰 재사용 |
| `src/styles/global.css` | 430px 앱 셸, fixed 하단 탭, safe-area 구조 유지 |
| `src/test/setup.ts` | `HTMLDialogElement.showModal/close` 테스트 polyfill 재사용 |
| `src/application/clock.ts` | `demoTodayDate`와 deterministic interaction clock 재사용 |

### 3.3 현재 동작과 제약

- `/month`는 현재 placeholder route다.
- Month 탭 링크는 이미 `/month`를 가리킨다.
- `CalendarEvent`는 Google과 CatchUp 출처를 구분하지만 CRUD action과 `eventType`이 없다.
- prototype store는 새로고침 전까지 유지되는 in-memory 상태다. onboarding만 session storage를 사용한다.
- Today와 AI Mate는 공용 `calendarEventsById`를 읽으므로 동일 store에서 CRUD하면 이후 조회·계획 생성 입력에 자동 반영된다.
- 주간 계획은 월요일 시작, Month 달력은 일요일 시작이다. 두 날짜 정책을 공유 상수로 합치지 않는다.

## 4. 구현 범위

### 4.1 포함

- Month 탭을 실제 `/month` 화면에 연결
- 표시 연·월로부터 일요일 시작 7열 월간 그리드 계산
- 이전·다음 달 날짜를 포함한 4주, 5주, 6주 그리드
- 오늘 표시와 선택 날짜 표시
- 날짜별 일정 수 점 1~3개와 대표 일정 칩
- 이전 달, 다음 달, 오늘로 이동
- 날짜 선택 시 일정 상세 native dialog 바텀시트 열기
- URL과 선택 날짜·시트 제목·목록·폼 날짜 동기화
- ExtractedItem, Google CalendarEvent, CatchUp CalendarEvent 통합 표시
- CatchUp 직접 입력 일정 추가·수정·삭제
- 제목, 날짜, 시작 시간, 종료 시간, 캘린더, 유형 검증
- 저장·삭제 직후 Month 점·칩·상세 목록·공용 store 반영
- dirty 폼 이탈 확인, 삭제 확인, 포커스 복귀
- 저장·삭제 pending, 실패, 재시도 UI
- 모바일 safe area, 내부 스크롤, 키보드 대응
- 업로드 추출 일정에서 기존 Upload 수정 흐름으로 이동
- Today/Upload 탭 회귀 유지
- 단위, 컴포넌트, Playwright Chromium·WebKit 모바일 스모크 테스트

### 4.2 NOT in scope

- Google Calendar API, OAuth, 실제 동기화
- 백엔드, DB, 실제 repository/network 계층
- localStorage/sessionStorage 영속화 추가
- 사용자에게 노출되는 개발용 실패 토글
- Google Calendar 일정 또는 ExtractedItem의 Month 내 수정·삭제
- Todo 직접 수정
- 일정 CRUD 직후 주간 계획 자동 재조정
- 학업/개인/확인 필요 상태별 다색 카테고리
- 과제·시험·제출·공지의 개인 일정 폼 생성
- 종일 일정 생성 UI
- 자정을 넘는 단일 일정
- swipe-down 닫기 gesture
- 월간 AI 계획 생성
- 새 날짜·상태·폼 라이브러리
- 기존 AI Mate dialog의 별도 접근성 리팩터링

## 5. 확정된 설계 결정

1. 전역 상태: CalendarEvent CRUD는 기존 `PrototypeStore` reducer에 추가한다.
2. URL 상태: `month`, `date`, `sheet` query가 Month 탐색 상태의 source of truth다.
3. 폼 상태: 입력 draft와 validation/touched 상태만 dialog 내부 reducer에 둔다.
4. 시트: native `<dialog>.showModal()`을 bottom-sheet 스타일로 사용한다.
5. 날짜 계산: 새 라이브러리 없이 `Date.UTC()` 기반 순수 함수로 구현한다.
6. AI Mate: `AppShell`이 Month의 `sheet=schedule` URL을 읽어 시트가 열린 동안 `AiMateLayer`를 렌더링하지 않는다.
7. 모델: `CalendarEvent`에 `eventType: "personal" | "class"`만 추가하고 별도 캘린더 엔티티는 만들지 않는다.
8. 권한: UI와 reducer가 같은 `source === "catchup"` 규칙으로 이중 검증한다.
9. dirty 이탈: `useBlocker`로 닫기, 뒤로가기, 탭 이동을 같은 확인 흐름으로 처리한다.
10. URL history: 시트 열기만 push하고 월 이동·오늘 이동·저장 성공 후 선택 날짜 이동은 replace한다.
11. 삭제 확인: 두 번째 modal을 만들지 않고 기존 바텀시트의 행을 확인 상태로 전환한다.
12. E2E: 기존 Playwright 설정에 모바일 핵심 흐름 1개를 추가해 Chromium·WebKit에서 실행한다.
13. 폼 날짜: `draft.date`는 저장 전 로컬에만 유지하고 저장 성공 후 URL 선택 날짜를 이동한다.
14. Google 연결 상태: 연결·해제는 Google 출처만 교체·제거하고 CatchUp 일정을 보존한다.
15. reducer 계약: 좁은 create/update command를 받고 소유권·출처·timestamp는 reducer가 관리한다.
16. 닫기 상태: route state에 sheet origin을 기록하고 navigation과 dismiss 원인을 분리한다.
17. 폼 전이: dirty 상태에서 create/edit/cancel/delete 전환도 공통 확인 흐름을 사용한다.
18. 정렬: 상세 목록 comparator와 대표 칩 comparator를 분리한다.
19. 실패 UI: injectable async mock mutation adapter로 pending·failure·retry를 구현한다.
20. 브라우저 검증: Chromium과 WebKit 자동 테스트, 실제 iOS Safari 수동 acceptance gate를 사용한다.

## 6. 수정·추가 파일

### 6.1 수정 파일

| 파일 | 역할 |
| --- | --- |
| `src/app/App.tsx` | `/month` placeholder를 `MonthPage`로 교체 |
| `src/app/AppShell.tsx` | Month schedule sheet URL일 때 AI Mate 레이어 일시 숨김 |
| `src/domain/types.ts` | `CalendarEvent.eventType` 추가 |
| `src/mocks/templates.ts` | 기존 mock event에 유형 추가, 편집 가능한 CatchUp 개인 일정 샘플 추가 |
| `src/store/prototypeReducer.ts` | 좁은 CalendarEvent CRUD command, 읽기 전용 guard, Google reconnect 보존 로직 추가 |
| `src/store/prototypeReducer.test.ts` | CRUD, 권한 거부, Google reconnect/disconnect 보존, Today/AI 소비 상태 검증 |
| `src/ui/icons.tsx` | Month에 필요한 이전/다음, 오늘, 깃발, 수정, 삭제 아이콘 추가 |
| `src/application/mockPlanEngine.test.ts` | 필수 `eventType`이 추가되는 inline CalendarEvent fixture 갱신 |
| `src/features/upload/ExtractionReviewPage.tsx` | Month에서 전달한 `focusItemId` 항목을 초기 확장 |
| `src/features/upload/UploadFlow.test.tsx` | 특정 추출 항목 focus route state 회귀 테스트 |
| `playwright.config.ts` | 기존 Chromium mobile과 같은 iPhone 13 WebKit 프로젝트 추가 |

### 6.2 추가 파일

| 파일 | 역할 |
| --- | --- |
| `src/features/month/MonthPage.tsx` | URL 상태 해석, store 연결, 월 화면과 dialog 조립 |
| `src/features/month/MonthCalendar.tsx` | 7열 헤더, 날짜 셀, 점, 대표 일정 칩, 날짜 버튼 |
| `src/features/month/MonthScheduleDialog.tsx` | 날짜별 목록, 추가/수정 폼, 삭제·이탈 확인, focus lifecycle |
| `src/features/month/monthModel.ts` | UTC 날짜 계산, query 정규화, 월 그리드 생성 |
| `src/features/month/monthModel.test.ts` | 윤년, 월 경계, 4·5·6주, 일요일 시작 테스트 |
| `src/features/month/monthSelectors.ts` | ExtractedItem과 CalendarEvent를 날짜별 표시 DTO로 결합 |
| `src/features/month/monthSelectors.test.ts` | 집계, 정렬, 점 수, 대표 칩, 권한 테스트 |
| `src/features/month/monthForm.ts` | draft 생성, validation, dirty 비교, 저장 payload 변환 |
| `src/features/month/monthForm.test.ts` | 필수값, 시간 역전, 유형·캘린더 검증 |
| `src/features/month/mockCalendarEventMutation.ts` | 기본 성공과 테스트 주입 실패를 제공하는 비동기 mock mutation adapter |
| `src/features/month/month.css` | Month와 bottom-sheet 전용 반응형 스타일 |
| `src/features/month/MonthPage.test.tsx` | route, URL, dialog, CRUD, 읽기 전용 액션, 포커스 테스트 |
| `e2e/month.spec.ts` | iPhone 13 핵심 흐름과 탭 회귀 스모크 테스트 |

`src/test/setup.ts`, `src/store/PrototypeStore.tsx`, `src/domain/selectors.ts`, `src/styles/global.css`는 현재 기능으로 충분하면 수정하지 않는다.

## 7. 컴포넌트 트리

```text
App
└─ PrototypeStoreProvider
   └─ AiMateProvider
      └─ RouterProvider
         └─ AppShell
            ├─ Outlet
            │  └─ MonthPage
            │     ├─ MonthHeader
            │     │  ├─ PreviousMonthButton
            │     │  ├─ MonthLabel
            │     │  ├─ NextMonthButton
            │     │  └─ TodayButton
            │     ├─ MonthCalendar
            │     │  ├─ WeekdayHeader × 7
            │     │  └─ WeekRow × 4|5|6
            │     │     ├─ DateCell × 7
            │     │     │  ├─ DateButton
            │     │     │  └─ EventDots
            │     │     └─ EventLane
            │     │        └─ RepresentativeEventChip (최대 2열 span)
            │     └─ MonthScheduleDialog
            │        ├─ DragHandle
            │        ├─ DialogHeader
            │        ├─ ScheduleList
            │        │  └─ ScheduleRow × N
            │        │     └─ EditableActions | SourceLabel
            │        ├─ AddScheduleButton
            │        ├─ ScheduleForm
            │        ├─ MutationStatusAndRetry
            │        ├─ InlineDeleteConfirmation
            │        └─ UnsavedChangesConfirmation
            ├─ AiMateLayer (schedule sheet가 닫힌 경우)
            └─ BottomNavigation
```

`MonthHeader`와 `ScheduleForm`은 초기에는 같은 feature 파일 내부의 작은 private component로 시작하고, 파일이 과도하게 커질 때만 분리한다.

비자명한 상태 전이를 유지보수할 수 있도록 다음 구현 파일에는 짧은 inline ASCII diagram 주석을 둔다.

- `src/features/month/MonthScheduleDialog.tsx`: `formMode`, `pendingIntent`, mutation 상태 전이
- `src/store/prototypeReducer.ts`: Google 출처 교체와 CatchUp 출처 보존 merge

## 8. 상태 모델과 mock 데이터

### 8.1 URL 상태

```text
/month?month=2026-07
/month?month=2026-07&date=2026-07-18&sheet=schedule
```

- `month`: `YYYY-MM`, 없거나 잘못되면 `demoTodayDate`의 월로 정규화
- `date`: `YYYY-MM-DD`, sheet가 열릴 때 필수
- `sheet`: `schedule`만 허용
- URL이 유효하지 않으면 한 번의 replace navigation으로 canonical query를 만든다.

### 8.2 도메인 상태

```ts
CalendarEvent {
  id;
  userId;
  title;
  date;
  startTime;
  endTime;
  isAllDay;
  source: "google-calendar" | "catchup";
  eventType: "personal" | "class";
  updatedAt;
}
```

### 8.3 Month 표시 DTO

```ts
MonthScheduleItem {
  id;
  title;
  date;
  startTime;
  endTime;
  isAllDay;
  source: "extracted-item" | "google-calendar" | "catchup";
  sourceLabel: "업로드 자료" | "Google Calendar" | "CatchUp 직접 입력";
  eventType;
  editable;
}
```

- `ExtractedItem`은 confirmed 상태만 Month에 표시한다.
- DTO는 원본을 복제·저장하지 않고 selector 결과로만 사용한다.
- 상세 목록은 종일, 시작 시간, 제목, 안정 ID 순서의 명시적 comparator로 정렬한다.
- 대표 칩은 별도 comparator로 시험·마감·제출, 시간이 고정된 CalendarEvent, 중요 공지, 기타 순서를 사용한다.
- 점은 일정 수 1개, 2개, 3개 이상을 각각 1, 2, 3개로 제한한다.

### 8.4 폼 draft

```ts
ScheduleDraft {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  calendar: "catchup";
  eventType: "personal" | "class";
}
```

- 캘린더 기본값: `catchup`
- 유형 기본값: `personal`
- 종일 일정은 생성하지 않으므로 시간은 모두 필수다.
- 수정 모드에서는 CatchUp 원본 event에서 draft를 한 번 생성한다.
- dirty는 initial draft와 현재 draft의 필드 비교로 계산한다.

### 8.5 reducer action

```text
calendar/eventCreated
calendar/eventUpdated
calendar/eventDeleted
```

- create command는 새 ID와 사용자가 편집 가능한 필드만 전달한다.
- reducer가 현재 사용자, `source: "catchup"`, `updatedAt`을 채운다.
- update command는 ID와 제목·날짜·시간·유형만 전달하며 기존 사용자·source·ID를 보존한다.
- update/delete는 대상 ID를 조회하고 `source === "catchup"`인 경우에만 적용한다.
- 외부 일정 update/delete는 상태를 바꾸지 않는다.
- ID는 UI 경계에서 `crypto.randomUUID()`로 생성하고 action에 전달한다.
- `updatedAt`은 reducer가 기존 deterministic interaction clock으로 생성한다.
- 저장 성공 후 별도의 주간 계획 action은 dispatch하지 않는다.

### 8.6 dialog UI 상태

```text
formMode: idle | creating | editing(eventId)
mutation: idle | saving | deleting(eventId) | failed(operation, message)
pendingIntent:
  navigate(blocker)
  | dismiss(button|escape|backdrop)
  | switchToCreate
  | switchToEdit(eventId)
  | cancelForm
  | startDelete(eventId)
  | null
sheetOrigin: route state의 fromMonth 여부
```

- dirty가 아닌 intent는 즉시 수행한다.
- dirty 상태에서 draft를 버리는 모든 intent는 같은 확인 UI를 거친다.
- navigation intent에서만 `blocker.proceed()`를 호출한다.
- dismiss intent는 origin에 따라 back 또는 query replace를 실행한다.
- mutation 실패 시 draft 또는 삭제 대상 행을 그대로 유지하고 재시도를 허용한다.

## 9. 데이터 흐름

### 9.1 최초 진입과 월 이동

1. `MonthPage`가 search params를 읽는다.
2. `month`가 없거나 잘못되면 `demoTodayDate` 기준 월로 replace한다.
3. `monthModel`이 표시 월의 첫날·마지막날을 계산한다.
4. 일요일 이전 날짜부터 토요일 이후 날짜까지 28, 35, 42개의 셀을 생성한다.
5. 이전/다음/오늘 버튼은 `month`만 변경하고 replace한다.
6. 주간 계획의 월요일 시작 helper는 사용하지 않는다.

### 9.2 날짜 선택과 시트 열기

1. 날짜 버튼을 누르면 현재 `month`를 유지하고 `date`, `sheet=schedule`을 push하며 route state에 `fromMonth`를 기록한다.
2. URL 날짜로 시트 제목, 목록 selector, 추가 폼 날짜를 모두 파생한다.
3. dialog DOM이 mount된 뒤 `showModal()`을 한 번 호출한다.
4. 해당 날짜 버튼을 focus return target으로 저장한다.
5. `AppShell`은 같은 URL을 보고 AI Mate 레이어를 렌더링하지 않는다.

### 9.3 시트 닫기와 history

1. clean 상태의 닫기·backdrop·Escape는 route state가 `fromMonth`이면 `navigate(-1)`을 실행한다.
2. 직접 deep link처럼 origin state가 없으면 `sheet`와 `date`를 제거해 replace한다.
3. dirty 상태에서는 `cancel` 이벤트를 `preventDefault()`하고 이탈 확인 상태를 연다.
4. 이탈 확인에서 유지하면 폼으로 복귀한다.
5. 버리기를 확정하면 navigation intent만 blocker를 proceed하고 dismiss intent는 close 함수를 실행한다.
6. dialog가 닫힌 뒤 저장한 날짜 버튼으로 포커스를 돌린다.

### 9.4 추가

1. `일정 추가`를 누르면 선택 날짜로 초기화된 폼을 펼친다.
2. submit 시 trim, 필수값, 날짜, 시간, 캘린더, 유형을 검증한다.
3. 종료 시간은 시작 시간보다 반드시 늦어야 한다.
4. async mock adapter 호출 중 저장 버튼을 비활성화하고 pending 상태를 표시한다.
5. adapter 성공 후 좁은 `calendar/eventCreated` command를 dispatch한다.
6. store 갱신으로 상세 목록과 Month 점·칩이 같은 render에서 갱신된다.
7. 폼을 초기화하고 접되 dialog는 유지한다.
8. 실패하면 draft를 유지하고 form-level 오류와 재시도 액션을 표시한다.

### 9.5 수정

1. `editable === true`인 CatchUp 행에만 수정 버튼을 표시한다.
2. 수정 버튼을 누르면 원본 event로 draft를 만든다.
3. 폼 날짜 변경은 저장 전 `draft.date`에만 반영하고 URL 선택 날짜·목록·focus target은 유지한다.
4. 검증 성공 후 async mock adapter를 호출한다.
5. adapter 성공 후 좁은 `calendar/eventUpdated` command를 dispatch한다.
6. reducer는 대상의 `source`를 다시 검증하고 불변 필드를 보존한다.
7. 수정한 일정이 다른 날짜로 이동하면 성공 후 URL의 `month/date`를 새 날짜로 replace한다.
8. 이전·새 날짜의 집계가 갱신되고 새 날짜 dialog 목록에 수정 항목이 보인다.
9. 실패하면 원래 선택 날짜와 draft를 유지하고 재시도를 제공한다.

### 9.6 삭제

1. CatchUp 행의 삭제 버튼을 누르면 그 행이 inline 확인 상태로 바뀐다.
2. 확인 중 다른 행의 수정·삭제 액션을 비활성화한다.
3. 취소하면 원래 행으로 복귀하고 삭제 버튼으로 focus를 돌린다.
4. 확인하면 async mock adapter 호출 중 행 액션을 비활성화한다.
5. 성공하면 `calendar/eventDeleted`를 dispatch한다.
6. 목록, 점, 칩이 즉시 갱신된다.
7. 실패하면 행과 확인 맥락을 유지하고 오류·재시도를 표시한다.
8. 선택 날짜에 일정이 0개가 되어도 dialog는 빈 상태로 유지한다.

### 9.7 Google 연결 상태 변경

1. Google 연결 성공은 기존 Google 출처 event만 새 Google mock 목록으로 교체한다.
2. CatchUp 출처 event는 map에 그대로 보존한다.
3. 연결 건너뛰기·해제는 Google 출처 event만 제거한다.
4. CalendarEvent CRUD 이후 onboarding transition을 수행하는 reducer 테스트로 보존을 검증한다.

### 9.8 폼 내부 전이

| 현재 상태 | 사용자 intent | dirty=false | dirty=true |
| --- | --- | --- | --- |
| creating/editing | 다른 행 수정 | 즉시 해당 edit draft로 전환 | 확인 후 전환 |
| creating/editing | 일정 추가 | 즉시 새 create draft로 전환 | 확인 후 전환 |
| creating/editing | 폼 취소 | idle로 전환 | 확인 후 idle |
| creating/editing | 삭제 시작 | 해당 행 삭제 확인 | 확인 후 삭제 확인 |
| creating/editing | 닫기/탭/back | 이동 또는 닫기 | 확인 후 pending intent 재개 |

## 10. 출처별 편집 권한

| 원본 | Month 표시 | 추가 | 수정 | 삭제 | 안내 |
| --- | --- | --- | --- | --- | --- |
| `ExtractedItem` | 예 | 아니오 | Month 내 불가 | 아니오 | `추출 정보 수정`으로 기존 Upload 상세 이동 |
| `CalendarEvent(source="google-calendar")` | 예 | 아니오 | 아니오 | 아니오 | `Google Calendar` 출처 텍스트 |
| `CalendarEvent(source="catchup")` | 예 | 예 | 예 | 예 | `CatchUp 직접 입력` 출처 텍스트 |
| `Todo` | 아니오 | 아니오 | 아니오 | 아니오 | Month 데이터에 포함하지 않음 |

권한은 색상이나 아이콘만으로 전달하지 않는다. 수정·삭제 버튼은 CatchUp 일정에만 렌더링하며, reducer도 외부 출처 변경 action을 거부한다.

ExtractedItem의 `documentId`와 `id`를 사용해 `/upload/:documentId/extraction`으로 이동하고 `focusItemId` route state를 전달한다. `ExtractionReviewPage`는 이 값이 유효할 때 해당 항목을 초기 확장한다.

## 11. 구현 순서와 단계별 완료 조건

### 단계 1. 날짜·표시 모델 기반

- `monthModel.ts`에 UTC 기반 parse/format/addMonth/grid 함수를 구현한다.
- 윤년, 이전·다음 달, 일요일 시작, 4·5·6주 테스트를 먼저 통과시킨다.

완료 조건:

- 2026년 7월을 포함한 임의 월이 하드코딩 없이 정확하다.
- 목업의 잘못된 날짜 배열을 복제하지 않는다.
- `new Date("YYYY-MM-DD")`의 로컬 파싱에 의존하지 않는다.

### 단계 2. 도메인·store CRUD

- `eventType`과 mock 데이터를 갱신한다.
- create/update/delete reducer action을 추가한다.
- CatchUp만 수정·삭제되는 reducer 테스트와 Google reconnect 보존 테스트를 통과시킨다.

완료 조건:

- store 변경이 같은 render에서 selector 소비자에 보인다.
- Google 일정은 악의적 update/delete action에도 그대로다.
- create/update command로 source·userId·id를 위조할 수 없다.
- Google 연결·해제가 CatchUp 일정을 제거하지 않는다.
- Todo·WeeklyPlan 상태는 CRUD 전후 동일하다.

### 단계 3. selector와 폼 규칙

- 일정 원본을 `MonthScheduleItem`으로 결합하고 날짜 Map을 만든다.
- 폼 초기화·검증·payload 변환을 순수 함수로 구현한다.
- 상세 목록과 대표 칩의 comparator를 분리한다.

완료 조건:

- 읽기 전용 출처와 편집 가능 출처가 정확히 구분된다.
- 점 수와 대표 칩이 결정적으로 계산된다.
- 종일 우선 목록 정렬과 시험·마감 우선 칩 정렬이 각각 검증된다.
- 종료 시간 동일·역전, 필수값 누락이 저장을 막는다.

### 단계 4. Month route와 달력 UI

- `/month` route를 연결한다.
- 헤더, 7열 달력, 오늘·선택·인접월 상태, 점·칩을 구현한다.
- 각 주에 별도 event lane을 두고 대표 칩을 최대 2열까지만 span한다.
- 4·5·6주에서 앱 셸과 하단 탭이 깨지지 않게 스타일링한다.

완료 조건:

- Month 탭 직접 진입과 Today/Upload 왕복이 된다.
- 날짜 셀과 헤더 열이 항상 정렬된다.
- 칩은 날짜 셀을 덮지 않고 시작 날짜 기준 최대 2열만 사용하며 주 경계를 넘지 않는다.

### 단계 5. 일정 dialog와 CRUD UI

- native dialog lifecycle, URL 동기화, 목록, 폼을 구현한다.
- async mock adapter와 추가·수정·삭제 pending/failure/retry를 연결한다.
- origin·pending intent 기반 이탈 확인과 폼 내부 전이를 연결한다.
- ExtractedItem을 Upload 수정 흐름에 연결한다.
- sheet open 중 AI Mate 레이어를 숨긴다.

완료 조건:

- 시트 기준 URL 날짜, 제목, 목록이 항상 같고 생성 폼은 그 날짜로 초기화된다.
- 수정 폼 날짜는 저장 전 draft에만 존재하고 성공 후 URL과 선택 날짜가 함께 이동한다.
- CatchUp 일정만 액션을 가진다.
- 저장·수정·삭제가 달력과 목록에 즉시 반영된다.
- 실패하면 draft/행을 유지하고 재시도할 수 있다.
- Escape, 닫기, 뒤로가기, 탭 이동이 dirty 규칙을 따른다.
- 다른 편집·추가·취소·삭제 intent도 dirty 규칙을 따른다.

### 단계 6. 접근성·반응형·회귀

- focus, aria, live error, touch target, safe area, keyboard scroll을 검수한다.
- 컴포넌트 및 Chromium·WebKit Playwright 테스트를 추가한다.
- typecheck 전 `CalendarEvent` literal을 전수 검색한다.
- typecheck, 전체 Vitest, Chromium·WebKit Month 스모크를 실행한다.

완료 조건:

- 닫힌 뒤 원래 날짜 버튼으로 focus가 복귀한다.
- 320px 폭과 200% 텍스트 확대에서 핵심 액션을 사용할 수 있다.
- Today, Upload, AI Mate의 기존 테스트가 통과한다.
- 실제 iOS Safari에서 native dialog, keyboard, safe area 수동 gate를 통과한다.

## 12. 예외 상태

| 상태 | 처리 |
| --- | --- |
| 일정 0개 | `이 날짜에는 일정이 없어요`와 일정 추가 CTA 표시 |
| 잘못된 query | `demoTodayDate` 기준 canonical URL로 replace |
| 제목 공백 | 제목 필드 오류, 저장 차단 |
| 날짜 형식 오류 | 날짜 필드 오류, 저장 차단 |
| 시간 누락 | 해당 시간 필드 오류, 저장 차단 |
| 종료 ≤ 시작 | `종료 시간은 시작 시간보다 늦어야 합니다.` |
| 캘린더 누락/변조 | CatchUp 캘린더 오류, 저장 차단 |
| 유형 누락/변조 | 허용 유형 오류, 저장 차단 |
| 읽기 전용 action dispatch | reducer no-op |
| dirty 이탈 | 바텀시트 내부 이탈 확인 |
| 삭제 확인 | 행 내부 확인 상태 |
| 저장·삭제 loading | mock adapter Promise가 pending인 동안 버튼·행 액션 비활성화와 진행 상태 표시 |
| 저장 실패 | draft 유지, form-level 오류, 재시도 |
| 삭제 실패 | 행·삭제 맥락 유지, 오류, 재시도 |
| 일정이 매우 많음 | 점 3개 제한, 대표 칩 1개, 상세 목록 내부 스크롤 |

## 13. 테스트 계획

### 13.1 커버리지 구조

```text
UTC 날짜 순수 함수 ─────────────── unit
        │
        ├─ 월 그리드(4/5/6주) ─── unit
        ├─ 일정 집계·대표 칩 ─── unit
        └─ 권한·폼 검증 ───────── unit
                  │
PrototypeStore CRUD reducer ────── unit
                  │
MonthPage + URL + dialog ───────── component
                  │
날짜 선택 → 추가/수정/삭제 ────── component
                  │
뒤로가기·포커스·탭 회귀 ───────── Playwright Chromium + WebKit
                  │
safe area·키보드·200% 확대 ────── manual QA
```

### 13.2 단위 테스트

- 1900/2000/2100 윤년
- 일요일 시작 월, 토요일 종료 월
- 28/35/42 셀 그리드
- 1월↔12월 연도 이동
- 인접 월 날짜의 ISO date와 inCurrentMonth
- 오늘/선택/인접월 상태 조합
- 일정 0/1/2/3/4개 점 수
- 종일 우선 목록 comparator와 대표 칩 우선순위 comparator
- confirmed ExtractedItem만 포함
- Google/ExtractedItem read-only, CatchUp editable
- 폼 trim, 필수값, 시간 순서, calendar/type allowlist
- reducer create/update/delete와 외부 출처 no-op
- reducer Google reconnect/disconnect 시 CatchUp 일정 보존
- 좁은 command가 불변 source/userId/id를 보존

### 13.3 컴포넌트 테스트

- `/month`가 placeholder 대신 Month를 렌더링
- 기본 URL 정규화
- 날짜 선택 후 query와 dialog 제목 동기화
- 다른 달 날짜 선택 시 표시 월·날짜 일치
- 읽기 전용 행에 수정·삭제 버튼 없음
- 추가 후 목록·점·칩 반영
- 수정 시 같은 날짜와 다른 날짜 이동
- 수정 날짜가 저장 전 URL·선택 날짜를 바꾸지 않음
- inline 삭제 확인 취소·확정
- 저장·삭제 pending, 실패, draft/행 유지, 재시도
- dirty 닫기·Escape·탭 이동과 폼 내부 intent 확인
- dialog 종료 후 날짜 버튼 focus 복귀
- sheet open 중 AI Mate launcher 없음
- ExtractedItem의 `추출 정보 수정`이 해당 Upload 항목을 펼침
- Today/Upload 링크 유지

### 13.4 Playwright 모바일 스모크

1. Chromium·WebKit iPhone 13 프로젝트로 `/month` 진입
2. 날짜를 선택해 dialog 열기
3. 개인 일정 추가 후 달력과 목록 반영 확인
4. 같은 일정을 수정
5. 삭제 확인을 거쳐 삭제
6. dirty 폼에서 browser back 후 유지/버리기 확인
7. dialog 닫힌 뒤 날짜 버튼 focus 확인
8. Today와 Upload 탭 왕복
9. console error와 가로 overflow 없음 확인
10. mock 실패 fixture에서 오류·재시도 확인

### 13.5 수동 QA

- 실제 iOS Safari와 Android Chrome 또는 동등한 실제 모바일 브라우저에서 320~430px 폭
- 4주, 5주, 6주 월
- 200% 텍스트 확대
- 키보드가 제목·시간·저장 버튼을 가리지 않는지
- 홈 인디케이터 safe area
- VoiceOver/TalkBack 순서와 이름
- 키보드 Tab/Shift+Tab, Enter/Space, Escape
- 일정명이 길고 일정 수가 많은 날짜
- 새로고침하면 mock 초기 상태로 돌아가는지
- swipe-down 닫기는 이번 범위가 아니며 닫기 버튼·Escape·backdrop·browser back만 검증

## 14. 접근성·반응형 기준

- 모든 날짜는 최소 44×44px 버튼이다.
- 날짜 버튼 `aria-label`에 전체 날짜, 오늘/선택, 일정 수를 포함한다.
- 오늘과 선택은 색상 외 텍스트/접근성 이름으로 구분한다.
- native dialog에 제목 연결, 설명 연결, 명시적 닫기 버튼을 둔다.
- dialog open 시 적절한 heading 또는 첫 입력으로 초기 focus를 이동한다.
- background는 native modal 동작으로 inert 처리한다.
- Escape는 clean일 때 닫고 dirty일 때 확인한다.
- 오류 메시지는 입력과 `aria-describedby`로 연결한다.
- mutation 오류는 `role="alert"` 또는 적절한 live region으로 알리고 재시도 버튼으로 focus를 이동하지 않는다.
- 아이콘 전용 버튼은 한국어 accessible name을 가진다.
- 날짜 grid와 주별 event lane의 열을 맞추고 칩에 `min-width: 0`, overflow/ellipsis를 적용한다.
- dialog는 `max-height`와 내부 scroll container를 사용한다.
- 하단 여백은 `env(safe-area-inset-bottom)`을 포함한다.
- 키보드 표시 시 focus field와 저장 액션이 scroll into view 가능해야 한다.

## 15. 위험·심각도·해결안

| 심각도 | 위험 | 권장 해결 |
| --- | --- | --- |
| Critical | 선택 날짜와 dialog 제목·목록 불일치 또는 저장 전 폼 날짜 이동 | 시트는 URL date에서 파생하고 draft date는 성공 전 로컬 유지 |
| Critical | Google/학업 일정 수정·삭제 | UI predicate와 reducer guard 이중 적용 |
| Critical | Google reconnect가 CatchUp 일정을 삭제 | Google 출처만 교체·제거하는 reducer merge |
| High | `YYYY-MM-DD` 파싱으로 하루 이동 | UTC component 함수와 string key 사용 |
| High | dirty 상태 browser back으로 입력 유실 | `useBlocker`와 dialog 내부 이탈 확인 |
| High | dirty 상태에서 다른 폼 intent로 입력 유실 | pending intent 전이표와 공통 확인 |
| High | reducer action으로 source·소유권 위조 | 좁은 command와 reducer의 불변 필드 관리 |
| High | 저장·삭제 실패 시 draft/행 소실 | async mock adapter, 실패 상태 유지, 재시도 |
| High | 종료 시간이 시작보다 빠르거나 같음 | 순수 validation과 submit 차단 |
| High | dialog가 탭바·키보드에 가림 | native top-layer dialog, max-height, 내부 scroll, safe area |
| High | dialog 종료 후 focus 유실 | 날짜 버튼 ref 저장·복귀 |
| Medium | 2026년 7월 목업 배열 하드코딩 | 표시 월 기반 28/35/42 셀 계산 |
| Medium | Month 일요일 시작과 계획 월요일 시작 혼동 | 서로 다른 명명과 테스트, helper 공유 금지 |
| Medium | 4·5·6주 높이 깨짐 | 행 수 CSS 변수와 최소 셀 높이 |
| Medium | 칩이 날짜 셀이나 다른 주를 침범 | 주별 event lane, 최대 2열 span, 주 경계 clamp |
| Medium | sheet open 중 AI Mate 버튼 노출 | AppShell에서 URL 기반 일시 미렌더 |
| Medium | URL history가 월·날짜 변경마다 누적 | 시트 open만 push, 나머지 replace |
| Medium | Today/Upload/AI 계획 입력 회귀 | 공용 store reducer 테스트와 탭 E2E |
| Low | 작은 mock에서 과도한 계산 | 날짜별 Map 1회 생성과 useMemo |

### 15.1 실패 모드 커버리지

| 코드 경로 | 현실적인 실패 | 테스트 | 오류 처리 | 사용자에게 보이는 결과 |
| --- | --- | --- | --- | --- |
| URL 정규화 | 잘못된 월·날짜 query로 무한 replace | component | canonical 값 비교 후 1회 replace | 정상 기준 월로 복구 |
| UTC 월 모델 | 윤년·연도 경계에서 셀 누락 | unit | 순수 함수 invariant | 잘못된 달력 대신 테스트에서 차단 |
| 일정 selector | 같은 시간 항목의 순서가 render마다 변경 | unit | 안정 ID tie-breaker | 결정적 목록·칩 |
| 권한 predicate | Google 일정에 편집 액션 노출 | unit/component | UI 숨김 + reducer guard | 읽기 전용 출처만 표시 |
| Google reconnect | CatchUp 일정 map 소실 | reducer regression | 출처별 merge/remove | CatchUp 일정 유지 |
| create/update command | source·userId·ID 위조 | reducer unit | reducer가 불변 필드 생성·보존 | 조용한 권한 상승 없음 |
| dialog open | invalid state에서 `showModal()` 중복 호출 | component/E2E | ref/open guard | 시트가 한 번만 열림 |
| dialog close | deep link에서 `navigate(-1)`로 앱 이탈 | component/E2E | route origin 분기 | Month base URL로 복구 |
| dirty transition | 다른 edit/create intent가 draft 덮어씀 | component | pending intent 확인 | 버리기 전 명시적 확인 |
| 저장 mutation | Promise reject 또는 중복 submit | component/E2E | pending lock, draft 유지, retry | 오류 메시지와 재시도 |
| 삭제 mutation | reject 후 행이 먼저 사라짐 | component/E2E | 성공 후 dispatch, 행 유지 | 행 오류와 재시도 |
| 수정 날짜 이동 | 저장 전 선택·목록·focus target 변경 | component | draft date 로컬 유지 | 성공 후에만 새 날짜로 이동 |
| event lane | 마지막 금요일/토요일 칩이 다음 주 침범 | unit/component/manual | 주 경계 span clamp | 현재 주 안에서 말줄임 |
| Upload 연결 | document/item이 없거나 stale | component | 기존 not-found 및 fallback expansion | Upload fallback 화면 또는 첫 항목 |
| WebKit dialog | Safari focus·keyboard 차이 | WebKit E2E + real-device manual | native dialog, 내부 scroll | 사용할 수 있는 닫기·저장 UI |

테스트도 오류 처리도 없이 조용히 실패하는 critical gap은 현재 계획에 없다.

## 16. 회귀·충돌 위험

### 16.1 기존 코드 회귀

- 최근 `071b2e5`는 Today/Onboarding을, `8751d0c`는 Upload/AI Mate를 추가했다.
- Month는 `AppShell`, `CalendarEvent`, prototype reducer, mock template을 공유하므로 두 커밋의 동작과 인접한다.
- 특히 CalendarEvent 필수 필드 추가는 모든 fixture와 test builder를 갱신해야 한다.
- `src/application/mockPlanEngine.test.ts`의 inline fixture를 포함해 `rg`로 모든 literal을 확인한다.
- global CalendarEvent CRUD는 Today와 이후 AI Mate 계획 생성 입력에 반영되지만 자동 재조정 action은 발생시키면 안 된다.
- onboarding의 Google 연결·건너뛰기 reducer는 CatchUp 출처를 보존해야 한다.
- AppShell의 AI Mate 조건부 렌더는 Month sheet에만 한정하고 AI Mate 자체 상태 provider는 유지한다.

### 16.2 작업 트리 충돌

현재 사용자 변경 파일:

- `AGENTS.md`
- `DATA_MODEL.md`
- `IA.md`
- `IMPLEMENTATION_PLAN.md`
- `PRD.md`
- `README.md`
- `SCREEN_SPEC.md`
- `USER_FLOW.md`
- 여러 디자인 문서와 `CatchUp/` untracked 경로

구현자는 이 파일들을 자동 포맷하거나 덮어쓰지 않는다. 이번 계획은 별도 `MONTH_IMPLEMENTATION_PLAN.md`에만 기록하며, 실제 구현은 6장의 명시된 소스 파일과 새 Month feature 파일로 제한한다. 겹침이 생기면 작업을 멈추고 diff를 확인한다.

## 17. 병렬화 계획

의존 순서를 먼저 고정한 뒤 세 작업 lane으로 나눈다.

```text
Lane A (sequential foundation)
  날짜 모델 → 도메인 타입 → reducer CRUD
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
Lane B (parallel)       Lane C (parallel)
  selector/form tests     calendar UI/CSS
        └─────────┬─────────┘
                  ▼
Lane D (sequential integration)
  dialog + URL + blocker → component tests → Playwright/manual QA
```

- 병렬 가능: selector/form 순수 로직과 calendar UI/CSS
- 순차 필수: 타입→reducer, URL→dialog lifecycle, 통합→E2E
- 같은 파일을 동시에 수정하지 않는다.

## 18. 과도한 설계 및 MVP 초과 방지

다음은 구현하지 않는다.

- 캘린더 repository abstraction
- 상태 관리·날짜·폼·dialog 라이브러리 도입
- Calendar 엔티티와 다중 캘린더 선택
- 서버 optimistic update/rollback
- 사용자용 artificial failure toggle
- 가상화
- 반복 일정, timezone 선택, 종일 일정 생성
- 다색 category system
- AI 자동 재계획

현재 일정 수와 기능 범위에서는 순수 함수 + 기존 reducer + native platform API가 가장 작은 완전한 구조다.

## 19. 아직 결정이 필요한 사항

현재 사용자 결정이 필요한 구현 사항은 없다. 독립 outside-voice 지적은 모두 사용자 결정으로 해소됐다. swipe-down 닫기는 `TODOS.md`의 P3 후속 항목으로 기록했다.

## 20. 최종 구현 시작 판정

**GO**

다음 조건을 충족하면 구현을 시작할 수 있다.

1. 구현 시작 직전 dirty source 파일이 새로 생기지 않았는지 확인한다.
2. 1단계 날짜 모델 테스트부터 시작한다.
3. 각 단계 완료 조건을 만족하지 않으면 다음 단계로 넘어가지 않는다.

현재까지 발견된 미해결 critical gap은 없다. 외부 API나 backend 없이 기존 prototype 구조 안에서 구현 가능하다.

## 21. Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~3h / CC: ~25min)** — Month date model — UTC 기반 월 그리드와 query 정규화 구현
  - Surfaced by: Architecture Review — 목업 날짜 하드코딩과 timezone 하루 이동 위험
  - Files: `src/features/month/monthModel.ts`, `src/features/month/monthModel.test.ts`
  - Verify: `pnpm test -- monthModel`
- [ ] **T2 (P1, human: ~4h / CC: ~35min)** — PrototypeStore — 좁은 CalendarEvent CRUD command와 Google 출처 merge 구현
  - Surfaced by: Code Quality / Outside Voice — 위조 가능한 action과 reconnect 시 CatchUp 일정 소실
  - Files: `src/domain/types.ts`, `src/store/prototypeReducer.ts`, `src/store/prototypeReducer.test.ts`, `src/mocks/templates.ts`, `src/application/mockPlanEngine.test.ts`
  - Verify: `pnpm typecheck && pnpm test -- prototypeReducer mockPlanEngine`
- [ ] **T3 (P1, human: ~3h / CC: ~25min)** — Month selectors — 출처 권한, 날짜 index, 목록·칩 comparator 분리
  - Surfaced by: Code Quality / Performance / Outside Voice — 권한 중복, 42×N 탐색, 정렬 기준 충돌
  - Files: `src/features/month/monthSelectors.ts`, `src/features/month/monthSelectors.test.ts`
  - Verify: `pnpm test -- monthSelectors`
- [ ] **T4 (P1, human: ~3h / CC: ~25min)** — Month form — validation, dirty 비교, 좁은 command 변환 구현
  - Surfaced by: Code Quality Review — 시간 역전, 허용되지 않은 calendar/type, draft 유실 위험
  - Files: `src/features/month/monthForm.ts`, `src/features/month/monthForm.test.ts`
  - Verify: `pnpm test -- monthForm`
- [ ] **T5 (P1, human: ~6h / CC: ~50min)** — Month dialog — URL origin, native dialog, pending intent, focus 상태 머신 구현
  - Surfaced by: Architecture / Outside Voice — direct deep link와 dismiss/blocker 혼동, 폼 내부 dirty 전이 누락
  - Files: `src/features/month/MonthPage.tsx`, `src/features/month/MonthScheduleDialog.tsx`, `src/features/month/MonthPage.test.tsx`
  - Verify: `pnpm test -- MonthPage`
- [ ] **T6 (P1, human: ~3h / CC: ~25min)** — Mock mutations — 저장·삭제 pending, failure, retry 구현
  - Surfaced by: Outside Voice / user decision D26 — 디자인 완료 조건의 저장·삭제 실패 UI
  - Files: `src/features/month/mockCalendarEventMutation.ts`, `src/features/month/MonthScheduleDialog.tsx`, `src/features/month/MonthPage.test.tsx`
  - Verify: failure adapter 주입 시 draft/행 유지와 retry 성공 테스트
- [ ] **T7 (P2, human: ~6h / CC: ~45min)** — Month calendar UI — 7열 날짜 grid와 주별 event lane 구현
  - Surfaced by: Design / Failure Modes — 4·5·6주 높이와 대표 칩의 날짜·주 침범 위험
  - Files: `src/features/month/MonthCalendar.tsx`, `src/features/month/month.css`, `src/ui/icons.tsx`
  - Verify: 4·5·6주 component test와 320~430px 수동 확인
- [ ] **T8 (P2, human: ~2h / CC: ~15min)** — Upload handoff — 해당 ExtractedItem 수정 흐름 연결
  - Surfaced by: Outside Voice — 학업 추출 일정의 기존 Upload 편집 경로 누락
  - Files: `src/features/upload/ExtractionReviewPage.tsx`, `src/features/upload/UploadFlow.test.tsx`, `src/features/month/MonthScheduleDialog.tsx`
  - Verify: `추출 정보 수정` 후 해당 item이 펼쳐지는 component test
- [ ] **T9 (P1, human: ~5h / CC: ~40min)** — Integration QA — route, AppShell, Chromium·WebKit 회귀 검증
  - Surfaced by: Test Review / Outside Voice — browser history, native dialog, Safari, Today/Upload 회귀 공백
  - Files: `src/app/App.tsx`, `src/app/AppShell.tsx`, `src/features/month/MonthPage.test.tsx`, `playwright.config.ts`, `e2e/month.spec.ts`
  - Verify: `pnpm typecheck && pnpm test && pnpm test:e2e`

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | 실행하지 않음 |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Codex CLI 미인증으로 별도 Claude outside voice 사용 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 28 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 실행하지 않음 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 실행하지 않음 |

**VERDICT:** ENG CLEARED — 구현 시작 가능

NO UNRESOLVED DECISIONS
