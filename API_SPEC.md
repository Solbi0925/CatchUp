# CatchUp MVP REST API 명세

## 1. 문서 목적과 범위

이 문서는 현재 목 데이터 기반 프로토타입의 화면 코드와 `DATA_MODEL.md`를 바탕으로, localhost MVP에 필요한 Frontend-Local Backend/Bridge HTTP 계약을 정의한다. 대상 화면은 Google Calendar 온보딩, Today, Month, Upload, 전역 AI Mate이다.

- API 기본 경로: `/api/v1`
- 날짜: `YYYY-MM-DD`, 시간: `HH:mm`, 시각: ISO 8601 문자열(예: `2026-07-19T20:00:00+09:00`)
- 응답의 `estimatedDurationMinutes`는 `DATA_MODEL.md`의 `estimatedDuration`을 분 단위 정수로 정규화한 구현 필드다.
- 응답의 `referenceWindowEndDate`는 계획 생성 시점 기준 향후 약 4주 참고 범위의 끝 날짜다.
- `eventType`은 현재 Month 화면에서 사용하는 `CalendarEvent`의 보조 분류(`personal`, `class`)다.
- 모든 예시는 익명화된 목 데이터다. API 키, OAuth 토큰, 실제 학생 정보는 응답에 포함하지 않는다.

### 로컬 실행 경계

- 이 API는 발표용 노트북에서 실행되는 `backend/` Local Backend/Bridge만 제공하며, Vercel·클라우드 백엔드·퍼블릭 URL에 배포하지 않는다.
- `frontend/`는 localhost의 Bridge에만 요청한다. 화면 표시와 재사용에 필요한 최소 결과는 Frontend Local Storage에 저장한다.
- 파일은 Bridge가 로컬에서 임시 처리하고, AI 추출 또는 계획 생성에 필요한 최소 문맥만 AI 실행 어댑터에 전달한다. 임시 원본 파일은 처리 완료 또는 실패 뒤 보존하지 않는다.
- AI 관련 엔드포인트는 Local Backend/Bridge의 분리된 AI 실행 어댑터를 통해 `codex exec`를 호출한다. 이는 제공된 ChatGPT Pro Codex 구독 인증을 사용하며, 브라우저·Backend 어디에서도 OpenAI API Key를 직접 사용하거나 저장하지 않는다.
- Google OAuth와 Calendar 읽기 연동은 Upload·AI·계획 핵심 기능이 완료된 뒤 localhost 환경에서 적용한다. 배포 URL 기반 OAuth 순서는 사용하지 않는다.

### 공통 로컬 호출·OAuth 보호와 오류 형식

이번 발표용 localhost MVP에서는 별도 CatchUp 계정 로그인이나 클라우드 사용자 세션을 전제하지 않는다. Frontend가 로컬 프로필/데모 상태를 관리하고 Bridge는 localhost origin 요청만 수신한다. 아래 API의 `인증 여부: 필요`는 외부 사용자 로그인 요구가 아니라 localhost Frontend 요청 범위 확인을 뜻한다. Google OAuth 시작·콜백에서는 Bridge가 CSRF 방지 `state`와 로컬 보안 세션을 사용한다. 클라이언트는 Google OAuth 비밀값을 path/body에 보내지 않는다.

```json
{
  "error": {
    "code": "EXTRACTION_REVIEW_REQUIRED",
    "message": "확인이 필요한 추출 결과를 저장한 뒤 주간 계획을 생성할 수 있습니다."
  }
}
```

공통 오류 코드는 다음과 같다.

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 필수값, 날짜·시간 형식, 시간 범위가 올바르지 않음 |
| 401 | `UNAUTHORIZED` | 유효한 로그인 세션이 없음 |
| 403 | `FORBIDDEN` | 다른 사용자의 리소스이거나 수정 권한이 없음 |
| 404 | `RESOURCE_NOT_FOUND` | 요청한 문서, 일정, 할 일 등을 찾을 수 없음 |
| 409 | `CONFLICT` | 현재 상태에서 처리할 수 없음 |
| 413 | `FILE_TOO_LARGE` | 업로드 파일 크기 제한 초과 |
| 415 | `UNSUPPORTED_FILE_TYPE` | PDF·이미지가 아닌 파일 |
| 422 | `AI_PROCESSING_FAILED` | AI 추출 또는 AI Mate 처리 실패 |
| 429 | `AI_ADJUSTMENT_LIMIT_REACHED` | 오늘 AI 계획 조정 10회를 모두 사용함 |
| 502 | `GOOGLE_CALENDAR_CONNECTION_FAILED` | Google Calendar 연결 또는 동기화 실패 |

## 2. 화면과 API 매핑

| 화면 | 필요한 API |
| --- | --- |
| Google Calendar 연동 | 1, 2, 3 |
| Today | 1, 5, 6, 10 |
| Month | 6, 7, 8, 9 |
| Upload / 추출 결과 검토 | 11, 12, 13, 14 |
| 전역 AI Mate | 1, 5, 10, 15 |

## 3. API 상세

### 1. 내 사용자·계획 상태 조회

- 목적: 앱 초기 진입과 AI Mate 헤더에서 사용자 표시명, Google Calendar 연결 상태, 현재 7일 Plan 기간, 당일 조정 잔여 횟수를 표시한다.
- HTTP Method / Endpoint: `GET /api/v1/me`
- 인증 여부: 필요
- Request: 없음

```json
{
  "user": {
    "id": "user-demo-01",
    "displayName": "테스트 학생",
    "calendarConnectionStatus": "connected",
    "planStartDate": "2026-07-22",
    "planEndDate": "2026-07-28",
    "planGenerationRequest": "앞으로 7일 동안 쉬는 시간을 많이 확보해줘."
  },
  "adjustmentUsage": {
    "date": "2026-07-20",
    "usedCountToday": 1,
    "remainingCountToday": 9,
    "dailyLimit": 10
  }
}
```

- 에러 코드: `UNAUTHORIZED`
- 사용하는 화면: Today, AI Mate, Google Calendar 연동

### 2. Google Calendar OAuth 연결 시작 (핵심 기능 완성 후)

- 목적: localhost 리디렉션 URI로 Google Calendar 권한 승인 화면에 이동할 일회성 URL을 만든다. OAuth access/refresh token은 Local Backend/Bridge의 로컬 보안 세션 또는 운영체제 보안 저장소에서만 관리한다.
- HTTP Method / Endpoint: `POST /api/v1/calendar-connections/google/authorize`
- 인증 여부: 필요
- Request Body

```json
{
  "returnPath": "/onboarding/calendar"
}
```

```json
{
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "connectionStatus": "connecting"
}
```

- 에러 코드: `UNAUTHORIZED`, `GOOGLE_CALENDAR_CONNECTION_FAILED`
- 사용하는 화면: Google Calendar 연동

### 3. Google Calendar OAuth 콜백 및 연결 완료 (핵심 기능 완성 후)

- 목적: Google 인증 후 권한 코드 검증, 연결 상태 저장, 개인 일정 초기 동기화를 수행한 뒤 앱으로 되돌린다.
- HTTP Method / Endpoint: `GET /api/v1/calendar-connections/google/callback`
- 인증 여부: OAuth state로 연결된 사용자 세션 필요
- Request Query

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `code` | 예 | Google이 전달한 권한 코드 |
| `state` | 예 | 서버가 발급한 CSRF 방지 상태값 |
| `error` | 아니오 | 사용자가 권한 승인을 취소했을 때 Google이 전달 |

```json
{
  "calendarConnectionStatus": "connected",
  "syncedEventCount": 4,
  "returnPath": "/today"
}
```

실제 브라우저 동작에서는 Local Backend/Bridge가 위 결과를 로컬에 반영한 후 localhost의 `returnPath`로 302 리다이렉트해도 된다. 퍼블릭 배포 URL은 사용하지 않는다.

- 에러 코드: `VALIDATION_ERROR`, `GOOGLE_CALENDAR_CONNECTION_FAILED`
- 사용하는 화면: Google Calendar 연동

### 4. 계획 생성 기본 요청사항 변경

- 목적: AI Mate에서 사용할 기본 자연어 요청사항을 저장한다. 고정된 생성 요일·시간이나 자동 생성 스케줄은 저장하지 않는다.
- HTTP Method / Endpoint: `PATCH /api/v1/me/plan-generation-preferences`
- 인증 여부: 필요
- Request Body

```json
{
  "planGenerationRequest": "앞으로 7일 동안 쉬는 시간을 많이 확보해줘."
}
```

```json
{
  "user": {
    "id": "user-demo-01",
    "displayName": "테스트 학생",
    "calendarConnectionStatus": "connected",
    "planGenerationRequest": "앞으로 7일 동안 쉬는 시간을 많이 확보해줘."
  }
}
```

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`
- 사용하는 화면: AI Mate

### 5. 현재 Calendar Week의 Plan과 할 일 조회

- 목적: Today가 보고 있는 월~일 Calendar Week의 날짜 스트립과 날짜별 `Todo`, 현재 7일 Plan 상태를 함께 제공한다. Calendar Week와 Plan 범위는 별도로 계산한다.
- HTTP Method / Endpoint: `GET /api/v1/weekly-plans/current`
- 인증 여부: 필요
- Request Query: `weekStartDate` 선택값은 Today Calendar Week 탐색용이다. 없으면 서버는 현재 시각(Asia/Seoul)을 기준으로 현재 날짜가 포함된 월요일을 사용한다. 이 값은 Plan 시작일이 아니다.

```json
{
  "weeklyPlan": {
    "id": "plan-demo-01",
    "userId": "user-demo-01",
    "planStartDate": "2026-07-22",
    "planEndDate": "2026-07-28",
    "calendarWeekStartDate": "2026-07-20",
    "calendarWeekEndDate": "2026-07-26",
    "status": "complete",
    "createdAt": "2026-07-22T09:10:00+09:00",
    "generationRequest": "앞으로 7일 동안 쉬는 시간을 많이 확보해줘.",
    "referenceWindowEndDate": "2026-08-16",
    "summary": "가까운 마감과 개인 일정을 반영해 할 일을 나누어 배치했어요."
  },
  "todos": [
    {
      "id": "todo-demo-01",
      "planId": "plan-demo-01",
      "sourceExtractedItemId": "extracted-demo-01",
      "scheduledDate": "2026-07-20",
      "title": "그래프 탐색 과제 요구사항 정리하기",
      "todoType": "assignment-work",
      "courseName": "알고리즘",
      "estimatedDurationMinutes": 60,
      "priority": "high",
      "isCompleted": false,
      "recommendationReason": "마감 전 검토 시간을 확보하도록 먼저 배치했어요.",
      "isWithinPlanRange": true
    }
  ]
}
```

계획이 아직 없으면 `200`과 `{ "weeklyPlan": null, "todos": [], "calendarWeek": { ... } }`를 반환한다. Calendar Week는 항상 반환하며, Plan 범위 밖 날짜에는 `isWithinPlanRange=false`를 제공한다. Today는 이 값을 사용해 날짜 원을 회색으로 표시한다.

- 에러 코드: `UNAUTHORIZED`
- 사용하는 화면: Today, AI Mate

### 6. Today/Month 일정 범위 조회

- 목적: 추출·확인 완료된 학업 일정과 Google Calendar/CatchUp 개인 일정을 같은 날짜 범위에서 조회한다. Month와 Today가 중복 API를 사용하지 않도록 통합한다.
- HTTP Method / Endpoint: `GET /api/v1/schedules`
- 인증 여부: 필요
- Request Query

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `startDate` | 예 | 조회 시작일 (`YYYY-MM-DD`) |
| `endDate` | 예 | 조회 종료일 (`YYYY-MM-DD`) |

```json
{
  "academicItems": [
    {
      "id": "extracted-demo-01",
      "documentId": "doc-demo-01",
      "title": "그래프 탐색 구현 과제",
      "itemType": "assignment",
      "courseName": "알고리즘",
      "date": "2026-07-23",
      "time": "23:59",
      "submissionMethod": "온라인 제출",
      "requiredMaterials": "소스 코드, 실행 결과 캡처",
      "difficulty": "high",
      "estimatedDurationMinutes": 240,
      "reviewStatus": "confirmed",
      "isUserEdited": false
    }
  ],
  "calendarEvents": [
    {
      "id": "calendar-demo-01",
      "userId": "user-demo-01",
      "title": "팀 프로젝트 회의",
      "date": "2026-07-20",
      "startTime": "14:00",
      "endTime": "16:00",
      "isAllDay": false,
      "eventType": "personal",
      "source": "google-calendar",
      "updatedAt": "2026-07-01T09:00:00+09:00"
    }
  ]
}
```

`academicItems`는 `reviewStatus=confirmed`인 항목만 반환한다. `needs-review` 상태는 Month/Today에 일정으로 노출하지 않는다.

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`
- 사용하는 화면: Today, Month

### 7. CatchUp 개인 일정 추가

- 목적: Month에서 CatchUp에 직접 입력한 개인·수업 일정을 추가한다. Google Calendar 원본 일정 생성·수정 API는 MVP에 없다.
- HTTP Method / Endpoint: `POST /api/v1/calendar-events`
- 인증 여부: 필요
- Request Body

```json
{
  "title": "개인 과제 정리 시간",
  "date": "2026-07-24",
  "startTime": "18:00",
  "endTime": "19:00",
  "isAllDay": false,
  "eventType": "personal"
}
```

```json
{
  "calendarEvent": {
    "id": "calendar-catchup-01",
    "userId": "user-demo-01",
    "title": "개인 과제 정리 시간",
    "date": "2026-07-24",
    "startTime": "18:00",
    "endTime": "19:00",
    "isAllDay": false,
    "eventType": "personal",
    "source": "catchup",
    "updatedAt": "2026-07-20T09:30:00+09:00"
  }
}
```

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`
- 사용하는 화면: Month

### 8. CatchUp 개인 일정 수정

- 목적: Month에서 CatchUp 직접 입력 일정의 제목, 날짜, 시간, 유형을 수정한다.
- HTTP Method / Endpoint: `PATCH /api/v1/calendar-events/{calendarEventId}`
- 인증 여부: 필요
- Request Path: `calendarEventId` — 수정할 `CalendarEvent.id`
- Request Body: 생성 API와 동일한 편집 가능 필드. `source`, `userId`, `updatedAt`은 서버 전용이다.

```json
{
  "title": "개인 과제 정리 시간",
  "date": "2026-07-25",
  "startTime": "17:00",
  "endTime": "18:00",
  "isAllDay": false,
  "eventType": "personal"
}
```

```json
{
  "calendarEvent": {
    "id": "calendar-catchup-01",
    "userId": "user-demo-01",
    "title": "개인 과제 정리 시간",
    "date": "2026-07-25",
    "startTime": "17:00",
    "endTime": "18:00",
    "isAllDay": false,
    "eventType": "personal",
    "source": "catchup",
    "updatedAt": "2026-07-20T10:00:00+09:00"
  }
}
```

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`
- 사용하는 화면: Month

### 9. CatchUp 개인 일정 삭제

- 목적: Month에서 CatchUp 직접 입력 일정을 삭제한다.
- HTTP Method / Endpoint: `DELETE /api/v1/calendar-events/{calendarEventId}`
- 인증 여부: 필요
- Request Path: `calendarEventId` — 삭제할 `CalendarEvent.id`

```json
{
  "deletedCalendarEventId": "calendar-catchup-01"
}
```

- 에러 코드: `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`
- 사용하는 화면: Month

Google Calendar에서 온 일정은 이 API로 수정·삭제할 수 없으며 `FORBIDDEN`을 반환한다.

### 10. 할 일 완료 상태 변경

- 목적: Today에서 AI가 생성한 `Todo`의 완료 체크만 변경한다. 제목, 날짜, 시간, 우선순위의 직접 수정은 허용하지 않는다.
- HTTP Method / Endpoint: `PATCH /api/v1/todos/{todoId}/completion`
- 인증 여부: 필요
- Request Path: `todoId` — `Todo.id`
- Request Body

```json
{
  "isCompleted": true
}
```

```json
{
  "todo": {
    "id": "todo-demo-01",
    "planId": "plan-demo-01",
    "sourceExtractedItemId": "extracted-demo-01",
    "scheduledDate": "2026-07-20",
    "title": "그래프 탐색 과제 요구사항 정리하기",
    "todoType": "assignment-work",
    "courseName": "알고리즘",
    "estimatedDurationMinutes": 60,
    "priority": "high",
    "isCompleted": true,
    "recommendationReason": "마감 전 검토 시간을 확보하도록 먼저 배치했어요."
  }
}
```

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`
- 사용하는 화면: Today

### 11. 업로드 자료 목록 조회

- 목적: Upload에서 이전에 분석한 파일명, 크기, 업로드 시각, 추출 상태를 표시한다.
- HTTP Method / Endpoint: `GET /api/v1/documents`
- 인증 여부: 필요
- Request: 없음

```json
{
  "documents": [
    {
      "id": "doc-demo-01",
      "userId": "user-demo-01",
      "fileName": "알고리즘_과제안내.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 214900,
      "documentType": "assignment-brief",
      "supportedFileFormat": "pdf",
      "uploadStatus": "complete",
      "extractionStatus": "complete",
      "uploadedAt": "2026-07-17T13:00:00+09:00"
    }
  ]
}
```

- 에러 코드: `UNAUTHORIZED`
- 사용하는 화면: Upload

### 12. 학업 자료 업로드 및 AI 추출

- 목적: PDF 또는 이미지 자료를 저장하고, AI가 추출한 `ExtractedItem`을 반환한다.
- HTTP Method / Endpoint: `POST /api/v1/documents:extract`
- 인증 여부: 필요
- Request Body: `multipart/form-data`

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `file` | 예 | PDF 또는 이미지 파일 |

```json
{
  "document": {
    "id": "doc-demo-05",
    "userId": "user-demo-01",
    "fileName": "UX_리서치_안내.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 180420,
    "documentType": "assignment-brief",
    "supportedFileFormat": "pdf",
    "uploadStatus": "complete",
    "extractionStatus": "needs-review",
    "uploadedAt": "2026-07-20T09:00:00+09:00"
  },
  "extractedItems": [
    {
      "id": "extracted-demo-10",
      "documentId": "doc-demo-05",
      "title": "UX 리서치 보고서",
      "itemType": "assignment",
      "courseName": "UX 디자인",
      "date": "2026-07-23",
      "time": "23:59",
      "submissionMethod": "LMS 과제함",
      "requiredMaterials": "리서치 결과, 보고서 PDF",
      "difficulty": "high",
      "estimatedDurationMinutes": 180,
      "reviewStatus": "needs-review",
      "isUserEdited": false
    }
  ]
}
```

Local Backend/Bridge는 파일 내용을 분석해 `documentType`을 정하고, 파일과 필요한 문맥을 분리된 AI 실행 어댑터를 통해 `codex exec`에 전달해 추출 결과를 얻는다. 이후 결과를 검증해 Frontend에 반환하며, 화면에 필요한 최소 결과만 Local Storage에 저장한다. `codex exec`는 ChatGPT Pro Codex 구독 인증을 사용하고 OpenAI API Key를 사용하지 않는다. Codex Exec에 전달하는 프롬프트는 이 명세의 범위에 포함하지 않는다.

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `AI_PROCESSING_FAILED`
- 사용하는 화면: Upload

### 13. 문서별 추출 결과 조회

- 목적: 추출 결과 확인·수정 화면을 열 때 원본 `UploadedDocument`와 해당 `ExtractedItem`을 함께 가져온다.
- HTTP Method / Endpoint: `GET /api/v1/documents/{documentId}`
- 인증 여부: 필요
- Request Path: `documentId` — `UploadedDocument.id`

```json
{
  "document": {
    "id": "doc-demo-05",
    "userId": "user-demo-01",
    "fileName": "UX_리서치_안내.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 180420,
    "documentType": "assignment-brief",
    "supportedFileFormat": "pdf",
    "uploadStatus": "complete",
    "extractionStatus": "needs-review",
    "uploadedAt": "2026-07-20T09:00:00+09:00"
  },
  "extractedItems": [
    {
      "id": "extracted-demo-10",
      "documentId": "doc-demo-05",
      "title": "UX 리서치 보고서",
      "itemType": "assignment",
      "courseName": "UX 디자인",
      "date": "2026-07-23",
      "time": "23:59",
      "submissionMethod": "LMS 과제함",
      "requiredMaterials": "리서치 결과, 보고서 PDF",
      "difficulty": "high",
      "estimatedDurationMinutes": 180,
      "reviewStatus": "needs-review",
      "isUserEdited": false
    }
  ]
}
```

- 에러 코드: `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`
- 사용하는 화면: Upload의 추출 결과 확인·수정

### 14. 문서별 추출 결과 일괄 저장·확정

- 목적: 사용자가 검토 화면에서 수정한 추출 항목을 한 번에 저장하고, 모든 항목을 `confirmed`로 확정한다.
- HTTP Method / Endpoint: `PUT /api/v1/documents/{documentId}/extracted-items`
- 인증 여부: 필요
- Request Path: `documentId` — `UploadedDocument.id`
- Request Body: 배열 전체를 보내므로 사용자가 삭제하지 않은 기존 항목을 보존하며, 사용자 입력값만 변경할 수 있다.

```json
{
  "items": [
    {
      "id": "extracted-demo-10",
      "title": "UX 리서치 보고서",
      "itemType": "assignment",
      "courseName": "UX 디자인",
      "date": "2026-07-23",
      "time": "23:59",
      "submissionMethod": "LMS 과제함",
      "requiredMaterials": "리서치 결과, 보고서 PDF",
      "difficulty": "high",
      "estimatedDurationMinutes": 180
    }
  ]
}
```

```json
{
  "document": {
    "id": "doc-demo-05",
    "userId": "user-demo-01",
    "fileName": "UX_리서치_안내.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 180420,
    "documentType": "assignment-brief",
    "supportedFileFormat": "pdf",
    "uploadStatus": "complete",
    "extractionStatus": "complete",
    "uploadedAt": "2026-07-20T09:00:00+09:00"
  },
  "extractedItems": [
    {
      "id": "extracted-demo-10",
      "documentId": "doc-demo-05",
      "title": "UX 리서치 보고서",
      "itemType": "assignment",
      "courseName": "UX 디자인",
      "date": "2026-07-23",
      "time": "23:59",
      "submissionMethod": "LMS 과제함",
      "requiredMaterials": "리서치 결과, 보고서 PDF",
      "difficulty": "high",
      "estimatedDurationMinutes": 180,
      "reviewStatus": "confirmed",
      "isUserEdited": true
    }
  ]
}
```

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`
- 사용하는 화면: Upload의 추출 결과 확인·수정

### 15. AI Mate 메시지 처리

- 목적: 전역 AI Mate의 자연어 메시지를 처리한다. 서버가 의도를 판별해 주간 계획 생성, 계획 조정, 추천 근거 설명, 도움말 중 필요한 동작만 수행한다.
- HTTP Method / Endpoint: `POST /api/v1/ai-mate/messages`
- 인증 여부: 필요
- Request Body

```json
{
  "message": "수요일에 개인 일정이 많으니 그날 할 일을 줄여줘.",
  "clientRequestId": "ai-operation-3"
}
```

`clientRequestId`는 재시도 시 같은 값을 보내 중복 계획 생성·중복 조정 사용량 증가를 막는다.

```json
{
  "clientRequestId": "ai-operation-3",
  "intent": "adjust-plan",
  "assistantMessage": "요청한 날의 부담이 줄도록 계획을 조정했어요.",
  "adjustment": {
    "id": "adjustment-demo-03",
    "userId": "user-demo-01",
    "planId": "plan-demo-01",
    "requestText": "수요일에 개인 일정이 많으니 그날 할 일을 줄여줘.",
    "requestedAt": "2026-07-20T21:10:00+09:00",
    "status": "complete",
    "usedCountToday": 2,
    "remainingCountToday": 8
  },
  "todos": [
    {
      "id": "todo-demo-05",
      "planId": "plan-demo-01",
      "sourceExtractedItemId": "extracted-demo-04",
      "scheduledDate": "2026-07-23",
      "title": "ERD 실습 파일 미리 열어보기",
      "todoType": "class-prep",
      "courseName": "데이터베이스",
      "estimatedDurationMinutes": 30,
      "priority": "medium",
      "isCompleted": false,
      "recommendationReason": "수요일의 부담을 줄여 다른 날로 조정했어요."
    }
  ]
}
```

주간 계획 생성 의도일 때 같은 응답에 `weeklyPlan`과 전체 `todos`를 포함한다. 추천 근거·도움말 의도일 때는 데이터 변경 없이 `assistantMessage`만 반환한다.

Local Backend/Bridge는 사용자 자료, 확정된 추출 결과, Google Calendar/CatchUp 개인 일정, 현재 주간 계획과 완료 상태를 모아 분리된 AI 실행 어댑터를 통해 `codex exec`에 전달하고, 반환된 구조화 결과를 검증해 Frontend에 반환한다. Frontend는 필요한 계획 결과만 Local Storage에 저장한다. OpenAI API를 브라우저나 Backend에서 직접 호출하지 않으며, `codex exec`는 ChatGPT Pro Codex 구독 인증을 사용한다. Codex Exec 프롬프트는 이 명세에 포함하지 않는다.

추가 도메인 오류 코드는 다음과 같다.

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 409 | `PLAN_GENERATION_NOT_SCHEDULED` | 사용하지 않음. 자동 생성 스케줄은 없다. |
| 409 | `PLAN_ALREADY_EXISTS` | 동일한 `planStartDate`의 Plan이 이미 생성됨 |
| 409 | `CALENDAR_CONNECTION_REQUIRED` | Google Calendar 연결 전이라 계획 생성 불가 |
| 409 | `EXTRACTION_REVIEW_REQUIRED` | 확인 필요 추출 결과가 남아 있음 |
| 409 | `NO_ACADEMIC_DATA` | 업로드·추출된 학업 정보가 없음 |
| 409 | `WEEKLY_PLAN_REQUIRED` | 조정할 주간 계획이 없음 |
| 429 | `AI_ADJUSTMENT_LIMIT_REACHED` | 오늘의 조정 요청 10회를 모두 사용함 |

- 에러 코드: `VALIDATION_ERROR`, `UNAUTHORIZED`, `AI_PROCESSING_FAILED`, `PLAN_ALREADY_EXISTS`, `CALENDAR_CONNECTION_REQUIRED`, `EXTRACTION_REVIEW_REQUIRED`, `NO_ACADEMIC_DATA`, `WEEKLY_PLAN_REQUIRED`, `AI_ADJUSTMENT_LIMIT_REACHED`
- 사용하는 화면: AI Mate (Today, Month, Upload에서 공통 사용)

## 4. MVP에서 의도적으로 만들지 않는 API

- `Todo` 생성·수정·삭제 API: 완료 상태 변경 외에는 AI Mate만 계획을 바꾼다.
- `Plan` 생성 API: 사용자가 요청한 날짜를 `planStartDate`로 삼아 정확히 7일을 생성한다. 자동 생성 스케줄은 없다.
- Google Calendar 일정의 생성·수정·삭제 API: 외부 캘린더 원본을 CatchUp에서 수정하지 않는다.
- 월간 자동 계획 생성 API 및 다른 외부 캘린더 연동 API
- 문서·추출 항목의 삭제 API: 현재 프로토타입 화면에 해당 행동이 없다.
- 별도 추천 근거 CRUD API: `Todo.recommendationReason`과 AI Mate 메시지로 충분하다.

## 5. 구현 시 서버 검증 규칙

- 계획 생성 범위는 요청일(`planStartDate`)부터 `planStartDate + 6일`까지이며, 생성 시점 기준 향후 약 4주를 참고 범위로 사용한다.
- 같은 사용자·같은 `planStartDate`에는 동일한 Plan을 중복 저장하지 않되, Calendar Week 경계와 Plan 경계는 별도로 계산한다.
- 계획 기간이 끝나도 미완료 Todo는 보존하며, 다음 생성 요청의 입력에 포함한다.
- AI Mate 조정은 날짜별 사용자별 사용량을 서버에서 계산하고, 성공적으로 계획 변경을 적용한 요청만 최대 10회 사용량에 반영한다.
- `reviewStatus=needs-review`인 `ExtractedItem`은 계획 생성 입력과 Today/Month 학업 일정에서 제외한다.
- CatchUp 직접 입력 일정만 수정·삭제할 수 있다. `source=google-calendar` 일정은 읽기 전용이다.
- AI가 반환한 구조화 데이터는 서버에서 enum, 날짜, 소유자 관계, 주간 범위를 검증한 뒤에만 저장한다.
