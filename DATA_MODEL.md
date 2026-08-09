# CatchUp 핵심 데이터 구조 초안

## 1. 문서 목적

이 문서는 CatchUp의 실제 데이터베이스(DB)를 설계하는 문서가 아니다.

지금 단계의 목적은 `MOCK_DATA.md`를 만들기 전에 앱이 다룰 핵심 정보의 이름과 모양을 간단히 통일하는 것이다. 이렇게 하면 Upload, AI Mate, Today, Month 화면이 같은 정보를 서로 다른 이름이나 형식으로 표시하는 일을 줄일 수 있다.

이 문서의 예시는 모두 가짜 데이터이며, 실제 학생 이름, 실제 일정, 이메일, API 키, Google OAuth 토큰은 사용하지 않는다.

## 2. 전체 관계 한눈에 보기

```text
User(사용자)
├─ UploadedDocument(업로드 자료)
│  └─ ExtractedItem(AI 추출 학업 정보)
├─ CalendarEvent(Google Calendar 또는 CatchUp 직접 입력 개인 일정)
├─ WeeklyPlan(이번 주 AI 계획)
│  └─ Todo(Today에 표시할 날짜별 할 일)
└─ PlanAdjustment(AI Mate 계획 조정 요청)
```

- `ExtractedItem`과 `CalendarEvent`는 AI Mate가 주간 계획을 만들 때 참고한다.
- `WeeklyPlan`은 한 주의 AI 계획 묶음이고, 그 안에 여러 개의 `Todo`가 들어간다.
- `Todo`는 Today 화면의 날짜별 할 일로 보인다.
- `PlanAdjustment`는 하루에 AI Mate 계획 조정을 몇 번 요청했는지 확인하는 데 사용한다.

---

## 3. 핵심 데이터 종류

### 3.1 User - 사용자와 주간 계획 설정

**쉬운 설명**

앱을 사용하는 사람 한 명의 기본 설정이다. 실제 이름이나 이메일 대신 Mock에서는 가짜 사용자 이름만 사용한다.

**Mock 데이터에 필요한 핵심 정보**

| 항목 이름 | 쉬운 뜻 |
| --- | --- |
| `id` | 사용자를 구분하는 번호 또는 이름표 |
| `displayName` | 화면에 보일 가짜 사용자 이름 |
| `calendarConnectionStatus` | Google Calendar 연결 상태: 연결 전, 연결 중, 연결 완료, 연결 실패 |
| `weeklyPlanGenerationDay` | 주간 계획을 생성하도록 설정한 요일 |
| `weeklyPlanGenerationTime` | 주간 계획을 생성하도록 설정한 시간 |
| `planGenerationRequest` | 계획 생성 시 사용자가 입력한 요청사항 |

**가짜 예시**

```text
id: user-demo-01
displayName: 테스트 학생
calendarConnectionStatus: 연결 완료
weeklyPlanGenerationDay: 일요일
weeklyPlanGenerationTime: 20:00
planGenerationRequest: 일요일에는 쉬는 시간을 많이 확보해줘.
```

**다른 데이터와의 관계**

한 명의 사용자는 여러 업로드 자료, 개인 일정, 주간 계획, 계획 조정 요청을 가질 수 있다.

---

### 3.2 UploadedDocument - 업로드한 학업 자료

**쉬운 설명**

사용자가 Upload 화면에 올린 강의계획서, LMS 공지, 과제 명세서 같은 학업 자료다.

**Mock 데이터에 필요한 핵심 정보**

| 항목 이름 | 쉬운 뜻 |
| --- | --- |
| `id` | 업로드 자료를 구분하는 번호 또는 이름표 |
| `userId` | 이 자료를 올린 사용자 |
| `fileName` | 화면에 보일 파일 이름 |
| `documentType` | 자료 종류: 강의계획서, LMS 공지, 과제 명세서 |
| `supportedFileFormat` | 업로드한 파일 형식: PDF 또는 이미지 |
| `uploadStatus` | 업로드 상태: 업로드 중, 업로드 완료, 업로드 실패 |
| `extractionStatus` | AI 추출 상태: 추출 중, 추출 완료, 확인 필요, 추출 실패 |
| `uploadedAt` | 자료를 올린 날짜 |

**가짜 예시**

```text
id: doc-demo-01
userId: user-demo-01
fileName: 알고리즘_과제안내.pdf
documentType: 과제 명세서
supportedFileFormat: PDF
uploadStatus: 업로드 완료
extractionStatus: 추출 완료
uploadedAt: 2026-07-17
```

**다른 데이터와의 관계**

업로드 자료 하나에서는 여러 개의 `ExtractedItem`이 나올 수 있다.

---

### 3.3 ExtractedItem - AI가 추출한 학업 정보

**쉬운 설명**

AI가 업로드 자료에서 찾아낸 과제, 시험, 마감일, 제출 방식, 준비물, 중요 공지, 수업 일정 정보다. 사용자는 Upload 화면에서 이 정보를 확인하고 수정할 수 있다.

**Mock 데이터에 필요한 핵심 정보**

| 항목 이름 | 쉬운 뜻 |
| --- | --- |
| `id` | 추출 정보 하나를 구분하는 번호 또는 이름표 |
| `documentId` | 어떤 업로드 자료에서 나온 정보인지 |
| `title` | 과제명, 시험명, 공지 제목 등 |
| `itemType` | 과제, 시험, 마감, 제출, 중요 공지, 수업 일정 중 하나 |
| `courseName` | 관련 과목명 또는 자료 출처 |
| `date` | 일정 날짜 또는 마감 날짜 |
| `time` | 시간이 있으면 표시, 없으면 종일 |
| `submissionMethod` | 제출 방식이 있으면 표시 |
| `requiredMaterials` | 준비물이 있으면 표시 |
| `difficulty` | 난이도: 높음, 보통, 낮음 |
| `estimatedDuration` | 예상 소요 시간 |
| `reviewStatus` | 사용자 확인 상태: 확인 완료, 확인 필요 |
| `isUserEdited` | 사용자가 AI 결과를 수정했는지 여부 |

**가짜 예시**

```text
id: extracted-demo-01
documentId: doc-demo-01
title: 그래프 탐색 구현 과제
itemType: 과제
courseName: 알고리즘
date: 2026-07-23
time: 23:59
submissionMethod: 온라인 제출
requiredMaterials: 없음
difficulty: 높음
estimatedDuration: 4시간
reviewStatus: 확인 완료
isUserEdited: false
```

**다른 데이터와의 관계**

이 정보는 `UploadedDocument`에서 나오며, AI Mate가 `WeeklyPlan`과 `Todo`를 만들 때 참고한다.

---

### 3.4 CalendarEvent - 개인 일정

**쉬운 설명**

Google Calendar에서 가져오거나 CatchUp 안에서 사용자가 직접 추가한 개인 일정이다. Mock 단계에서는 실제 연동 대신 가짜 개인 일정을 사용한다.

**Mock 데이터에 필요한 핵심 정보**

| 항목 이름 | 쉬운 뜻 |
| --- | --- |
| `id` | 개인 일정을 구분하는 번호 또는 이름표 |
| `userId` | 이 일정의 사용자 |
| `title` | 일정 이름 |
| `date` | 일정 날짜 |
| `startTime` | 시작 시간 |
| `endTime` | 종료 시간 |
| `isAllDay` | 하루 종일 일정인지 여부 |
| `source` | 일정 출처: Google Calendar 또는 CatchUp 직접 입력 |

**가짜 예시**

```text
id: calendar-demo-01
userId: user-demo-01
title: 팀 프로젝트 회의
date: 2026-07-20
startTime: 14:00
endTime: 16:00
isAllDay: false
source: Google Calendar
```

**다른 데이터와의 관계**

개인 일정은 `User`에게 속하며, AI Mate가 학업 일정과 시간 충돌을 피해서 계획을 만들 때 참고한다.

---

### 3.5 WeeklyPlan - AI가 만든 이번 주 계획

**쉬운 설명**

AI Mate가 한 주 동안 무엇을 언제 하면 좋을지 정리한 계획 묶음이다. 한 주는 언제나 월요일부터 일요일까지다.

**Mock 데이터에 필요한 핵심 정보**

| 항목 이름 | 쉬운 뜻 |
| --- | --- |
| `id` | 주간 계획을 구분하는 번호 또는 이름표 |
| `userId` | 이 계획의 사용자 |
| `weekStartDate` | 해당 주의 월요일 날짜 |
| `weekEndDate` | 해당 주의 일요일 날짜 |
| `status` | 계획 상태: 생성 전, 생성 완료, 생성 제한 |
| `createdAt` | 계획이 만들어진 날짜와 시간 |
| `generationRequest` | 계획을 만들 때 반영한 자연어 요청 |
| `referenceWindow` | 계획 생성 시 참고한 일정 범위. 앞으로 4주 |
| `summary` | 이번 주 계획의 짧은 요약 |

**가짜 예시**

```text
id: weekly-plan-demo-01
userId: user-demo-01
weekStartDate: 2026-07-20
weekEndDate: 2026-07-26
status: 생성 완료
createdAt: 2026-07-19 20:00
generationRequest: 일요일에는 쉬는 시간을 많이 확보해줘.
referenceWindow: 2026-07-20부터 4주
summary: 마감이 가까운 알고리즘 과제를 먼저 나누어 진행하는 계획입니다.
```

**다른 데이터와의 관계**

주간 계획 하나에는 여러 개의 `Todo`가 들어가며, 사용자는 같은 주에 하나의 주간 계획만 생성할 수 있다.

---

### 3.6 Todo - Today에 표시되는 날짜별 할 일

**쉬운 설명**

주간 계획 안에서 특정 날짜에 배치된 실제 행동 단위다. Today 화면에서는 선택한 날짜의 `Todo` 목록을 보여준다.

**Mock 데이터에 필요한 핵심 정보**

| 항목 이름 | 쉬운 뜻 |
| --- | --- |
| `id` | 할 일 하나를 구분하는 번호 또는 이름표 |
| `weeklyPlanId` | 어느 주간 계획에 들어있는 할 일인지 |
| `sourceExtractedItemId` | 어떤 과제나 시험 정보에서 나온 할 일인지 |
| `scheduledDate` | 이 할 일을 하도록 배치된 날짜 |
| `title` | 오늘 해야 할 행동 |
| `todoType` | 과제 진행, 시험 공부, 수업 준비, 복습 또는 예습 |
| `courseName` | 관련 과목명 또는 자료 출처 |
| `estimatedDuration` | 예상 소요 시간 |
| `priority` | 우선순위: 높음, 보통, 낮음 |
| `isCompleted` | 완료 체크 여부 |
| `recommendationReason` | 왜 이 날 이 할 일을 추천하는지에 대한 짧은 이유 |

**가짜 예시**

```text
id: todo-demo-01
weeklyPlanId: weekly-plan-demo-01
sourceExtractedItemId: extracted-demo-01
scheduledDate: 2026-07-20
title: 그래프 탐색 과제 요구사항 정리하기
todoType: 과제 진행
courseName: 알고리즘
estimatedDuration: 1시간
priority: 높음
isCompleted: false
recommendationReason: 마감일까지 시간이 짧고 예상 소요 시간이 길어 오늘 시작하는 것을 추천합니다.
```

**다른 데이터와의 관계**

할 일은 하나의 `WeeklyPlan`에 속하며, 보통 하나의 `ExtractedItem`을 바탕으로 만들어진다. 사용자는 완료 체크만 할 수 있고, 내용·날짜·우선순위를 직접 수정하지는 않는다.

---

### 3.7 PlanAdjustment - AI Mate 계획 조정 요청

**쉬운 설명**

사용자가 AI Mate에게 "오늘 할 일을 줄여줘"처럼 계획 변경을 요청한 기록이다. 하루에 최대 10번까지만 가능하다.

**Mock 데이터에 필요한 핵심 정보**

| 항목 이름 | 쉬운 뜻 |
| --- | --- |
| `id` | 조정 요청 하나를 구분하는 번호 또는 이름표 |
| `userId` | 요청한 사용자 |
| `weeklyPlanId` | 조정하려는 주간 계획 |
| `requestText` | 사용자가 AI Mate에 입력한 요청 문장 |
| `requestedAt` | 요청한 날짜와 시간 |
| `status` | 조정 상태: 요청 전, 조정 완료, 조정 제한 |
| `usedCountToday` | 오늘 사용한 조정 횟수 |
| `remainingCountToday` | 오늘 남은 조정 횟수 |

**가짜 예시**

```text
id: adjustment-demo-01
userId: user-demo-01
weeklyPlanId: weekly-plan-demo-01
requestText: 수요일에 개인 일정이 많으니 그날 할 일을 줄여줘.
requestedAt: 2026-07-20 21:10
status: 조정 완료
usedCountToday: 1
remainingCountToday: 9
```

**다른 데이터와의 관계**

계획 조정 요청은 사용자와 해당 주간 계획에 연결된다. 조정 결과는 같은 `WeeklyPlan` 안의 `Todo` 배치에 반영된 것으로 보여준다.

---

## 4. MOCK_DATA.md 작성 시 반드시 통일할 항목 이름

아래 이름은 Mock 데이터와 화면 구현에서 동일하게 사용한다.

| 화면 또는 기능 | 반드시 사용할 데이터 이름 |
| --- | --- |
| Upload의 파일 목록 | `UploadedDocument` |
| Upload의 AI 추출 결과 | `ExtractedItem` |
| Google Calendar 또는 CatchUp 직접 입력 개인 일정 | `CalendarEvent` |
| AI Mate가 만든 이번 주 계획 | `WeeklyPlan` |
| Today의 날짜별 할 일 | `Todo` |
| AI Mate 계획 조정 횟수와 요청 | `PlanAdjustment` |
| 사용자 및 생성 설정 | `User` |

또한 아래 항목 이름은 같은 의미로 통일한다.

- 일정 날짜: `date`
- Today에 배치된 날짜: `scheduledDate`
- 자료를 구분하는 값: `documentId`
- 주간 계획을 구분하는 값: `weeklyPlanId`
- 관련 과목명 또는 자료 출처: `courseName`
- 예상 소요 시간: `estimatedDuration`
- AI 추천 이유: `recommendationReason`
- 사용자 확인 상태: `reviewStatus`

## 5. CatchUp MVP 제한 반영

- 주간 계획의 범위는 항상 월요일부터 일요일까지다.
- 사용자는 설정한 요일과 시간에 주간 계획을 주 1회만 생성할 수 있다.
- AI Mate를 통한 계획 조정은 하루에 최대 10회다.
- 사용자는 Today의 할 일이나 주간 계획 항목의 내용, 날짜, 시간, 우선순위를 직접 수정하지 않는다. 변경은 AI Mate 요청으로만 한다.
- 외부 일정은 Google Calendar만 사용하며, CatchUp 안에서 개인 일정을 직접 추가할 수 있다.
- Mock 데이터와 예시에는 실제 개인정보, 실제 일정, API 키, OAuth 토큰을 넣지 않는다.
- 초기 MVP에서 업로드 파일은 PDF와 이미지 형식을 모두 지원한다.

## 6. 추후 실제 DB 연결 전에 추가로 결정할 사항

- 로그인 방식을 무엇으로 할지
- AI 추출 결과에서 날짜나 시간이 없는 항목을 어떻게 저장하고 표시할지
- 실제 AI 계획 조정 후 기존 Todo를 교체할지, 변경 기록을 남길지
