# CatchUp Local Bridge API

## 목적과 범위

Local Bridge는 학업자료 통합 분석과 AI 주간계획 초안 생성을 서로 다른 엔드포인트와 JSON Schema로 처리한다. 별도 DB, 클라우드 백엔드, OpenAI API Key를 사용하지 않는다.

```text
Vite Frontend -> Local Bridge -> codex exec -> 요청별 JSON Schema -> 애플리케이션 절대 규칙 검증 -> Local Storage
```

## POST `/api/academic-materials/analyze`

PDF와 이미지 파일들을 하나의 분석 작업으로 전달한다. Vite 개발 서버는 `/api` 요청을 Local Bridge로 프록시한다.

```json
{
  "operationId": "extract-1723360000000",
  "files": [{ "name": "sample.pdf", "mimeType": "application/pdf", "sizeBytes": 12000, "base64": "..." }],
  "existingEvents": [{ "id": "event-1", "title": "과제 1", "confirmationStatus": "unconfirmed" }]
}
```

- `files`는 1개 이상이어야 하며 PDF와 이미지만 허용한다.
- 전체 JSON 요청 크기는 40MB로 제한한다.
- 응답은 `operationId`, 분류된 `documents`, 통합된 `extractedItems`를 포함한다.
- 이벤트의 `sourceDocumentIds`와 `sourceReferences`로 원본 근거를 추적한다.
- `existingEvents`는 새 자료와 기존 이벤트가 같은 사건인지 비교하기 위한 구조화 데이터다. 같은 사건이면 모델이 `existingEventId`를 반환하고 앱이 필드와 출처를 병합한다.
- 근거가 없는 값은 `null` 또는 `unknown`이고, 모든 이벤트는 사용자 확인 전 `needs-review`다.
- 정보 충분성은 별도 `confirmationStatus`(`confirmed`/`unconfirmed`)와 `confirmationIssues`로 관리한다.
- 모든 학업 이벤트의 정확한 날짜는 `date`, 자료에 적힌 예정 주차는 `scheduledWeek`와 `scheduledWeekLabel`로 구분한다.
- 자료에 주차-날짜 대응 근거가 있으면 `weekOneStartDate`를 `YYYY-MM-DD`로 반환하고, 없으면 `null`로 유지한다.
- 시간표 이미지는 `timetable`로 분류하며 과목별 반복 수업을 `classMeetingTimes`의 `weekday`, `startTime`, `endTime`, `location`으로 반환한다.

## GET `/health`

```json
{ "ok": true, "service": "catchup-local-bridge" }
```

Bridge는 요청마다 OS 임시 디렉터리를 만들고 종료 시 삭제한다. 원본 파일은 저장하지 않으며 확정·미확정 구조화 이벤트는 날짜 정확도, 버전, 새 정보 확인 상태와 함께 브라우저의 `catchup.academic-events.v2`에 즉시 저장한다.

## Google Calendar 읽기 전용 API

- `GET /api/google-calendar/connect?returnTo=...`: 서버가 CSRF 방지 `state`를 생성·저장하고 Google OAuth 승인 화면으로 redirect한다.
- `GET /api/google-calendar/oauth/callback`: `state`와 승인 코드를 검증하고 서버에서 token을 교환한 뒤 앱으로 redirect한다.
- `GET /api/google-calendar/status`: token을 노출하지 않고 연결 여부, 마지막 동기화 시각, 고정 동기화 범위와 오류 코드만 반환한다.
- `POST /api/google-calendar/sync`: 최초 전체 동기화 또는 캘린더별 `syncToken` 증분 동기화를 실행한다.
- `POST /api/google-calendar/disconnect`: Google token 저장과 syncToken을 삭제한다.

기본 callback은 `http://localhost:4318/api/google-calendar/oauth/callback`이다. `CATCHUP_BRIDGE_PORT`를 변경하면 `GOOGLE_REDIRECT_URI`와 Google Cloud Console의 승인된 redirect URI도 같은 주소로 변경한다. 권한은 `calendar.events.readonly`와 캘린더 목록 확인용 `calendar.calendarlist.readonly`만 요청한다.

최초 동기화는 Google 계정의 기본(primary) 캘린더를 선택하고 OAuth 완료 시각부터 6개월 뒤까지의 범위를 한 번 고정한다. Google Events API는 `singleEvents=true`로 반복 일정을 발생 건별로 펼치고 `nextPageToken`이 끝날 때까지 조회한다. 마지막 페이지의 `nextSyncToken`을 저장하며 이후 호출은 변경·취소된 이벤트만 받는다. `410 Gone`이면 token을 버리고 처음 저장한 동일 범위를 전체 재동기화한다. 전체 재조회가 성공하기 전에는 브라우저의 기존 일정 컬렉션을 지우지 않는다.

서버 응답의 `upserts`, `deletedExternalKeys`, `replaceCalendarIds`, `removedCalendarIds`를 브라우저 저장소가 원자적으로 병합한다. `source=google-calendar` 일정만 교체·삭제하며 `source=catchup` 직접 입력 일정은 제목이 같아도 보존한다. Google `start.date/end.date`는 실제 종일 일정, `start.dateTime/end.dateTime`은 시간형 일정이다. 시간 없는 CatchUp AcademicEvent는 이 동기화 모델에 포함되지 않으며 종일로 변환하지 않는다.

access token, refresh token, OAuth state, syncToken은 Local Bridge의 서버 전용 파일에 `0600` 권한으로 저장하고 API·로그·브라우저에 반환하지 않는다. 기본 위치는 `~/.catchup/google-calendar-session.json`이며 테스트에서는 메모리 저장소와 Fake fetch를 사용한다. 동기화 실패 응답은 기존 Google 일정이나 WeeklyPlan을 삭제하지 않는다.

## AI 주간계획 API

최초 생성과 자동 업데이트는 동일한 `weekly-plan.schema.json`을 사용하되 모드별 지시와 잠금 범위를 다르게 전달한다.

- `POST /api/weekly-plans/generate`: 최초 7일 계획 초안
- `POST /api/weekly-plans/update`: 새 확정 AcademicEvent 또는 개인 일정에 직접 영향받는 미완료 Task의 최소 변경안
- `POST /api/weekly-plans/adjust`: Fast Path로 확정할 수 없는 사용자 자연어 요청의 변경 명령

생성·업데이트 요청에는 `mode`, `attempt`(1 또는 2), 정규화된 `input`, 첫 검증 실패 때의 `validationViolations`가 포함된다. 입력에는 계획 시작·종료·28일 참고 종료일, 확정 AcademicEvent와 Optional 추출 정보, 개인·반복 수업 일정, 기존 미완료·완료 Todo, `PlanningProfile`, 사용자 원문, 잠긴 Todo ID가 들어간다. 원본 파일 전체, 원본 근거 전문, OAuth 토큰, 계정 비밀은 전달하지 않는다. 과거 AcademicEvent는 28일 후보에서 제외하고 미완료 Todo는 별도 이월 후보로 전달한다.

응답은 다음 구조를 갖는다.

```json
{
  "interpretationSummary": "금요일 학습량을 줄입니다.",
  "interpretedConstraints": {
    "maxDailyMinutes": null,
    "maxTasksByWeekday": [{ "weekday": 5, "maxTasks": 1 }],
    "prohibitedWeekdays": [],
    "lightStudyWeekdays": [5],
    "preferredStudyWeekdaysByEventId": [],
    "blockedTimeRanges": []
  },
  "tasks": [{
    "clientTaskKey": "event-1-review-1",
    "sourceAcademicEventId": "event-1",
    "title": "시험 범위 복습하기",
    "todoType": "exam-study",
    "scheduledDate": "2026-08-22",
    "startTime": "10:00",
    "estimatedDurationMinutes": 90,
    "priority": "high",
    "taskPhase": "review",
    "dependsOnClientTaskKey": null,
    "carriedOverFromTodoId": null,
    "recommendation": {
      "needReasons": ["확정 시험 준비"],
      "placementReasons": ["개인 일정과 겹치지 않는 시간"],
      "priorityReasons": ["가까운 시험일"],
      "durationReasons": ["시험 범위와 저장된 예상시간"],
      "personalizationReasons": [],
      "userRequestReasons": ["금요일 학습량 감소"]
    }
  }],
  "warnings": [],
  "questions": []
}
```

모든 객체는 `additionalProperties: false`이며 날짜·시간·enum·양의 정수 소요시간을 Schema에서 제한한다. 모델은 `clientTaskKey`만 제안하고 WeeklyPlan/Todo ID와 저장 시각은 애플리케이션이 생성한다.

### 조정 전용 Fast Path와 변경 명령

AI Mate 조정은 먼저 브라우저 애플리케이션의 고신뢰 파서가 대상 Todo와 이동 날짜·요일, 마감 재분배, 분할, 증감, 우선순위, 일일·요일 한도, 금지·가벼운 요일 요청을 판정한다. 확실한 경우 Local Bridge나 Codex를 호출하지 않는다. 모호한 경우에만 계획 기간, 후보 Todo 요약, 관련 AcademicEvent, 완료·잠금 ID, 날짜별 학습량, 제목을 제거한 일정 시간 블록, 사용자 한도와 요청문을 `/api/weekly-plans/adjust`에 보낸다. 업로드 자료, 원본 출처, 무관한 미래 이벤트와 Optional 상세는 보내지 않는다.

조정 응답은 전체 `tasks` 배열이 아니라 다음과 같은 `plan-adjustment.schema.json` 변경 명령이다.

```json
{
  "interpretationSummary": "마감 전에 완료하도록 관련 작업을 재분배합니다.",
  "operations": [{
    "type": "rebalance_before_deadline",
    "targetTodoIds": ["todo-123"],
    "targetAcademicEventIds": ["event-123"],
    "scheduledDate": null,
    "weekday": null,
    "minutes": null,
    "taskCount": null
  }],
  "constraints": {
    "maxDailyMinutes": null,
    "maxTasksByWeekday": [],
    "prohibitedWeekdays": [],
    "preferredWeekdays": []
  },
  "warnings": [],
  "questions": []
}
```

모든 객체는 `additionalProperties: false`이고 operation type, ID, 날짜, 요일, 시간과 개수 범위를 서버와 애플리케이션이 다시 검사한다. 질문이 있으면 계획을 변경하지 않는다. 존재하지 않는 대상이나 해석 불가능한 명령만 검증 오류를 넣어 최대 한 번 재해석하며, 날짜 capacity나 일정 충돌처럼 코드가 판정할 문제는 모델을 재호출하지 않는다.

## 절대 규칙과 재생성

브라우저 애플리케이션은 Schema 통과 응답도 다시 검증한다. 실제 입력에 존재하는 확정 AcademicEvent인지, 날짜가 7일 범위와 원본 마감 이내인지, 현재 주 마감 작업량이 임의 축소되지 않았는지, dependency 순서와 일정 시간이 충돌하지 않는지, 금지 요일·일일 시간·요일별 개수 조건을 지키는지 확인한다. 업데이트에서는 완료 Todo와 영향받지 않은 Todo를 잠그고 diff를 계산한다.

생성·업데이트 첫 초안이 실패하면 `{ violations: [{ code, taskKey, message }] }`에 해당하는 목록을 두 번째 요청에 전달한다. 재생성은 최대 한 번이다. 조정 명령도 자연어 재해석이 필요한 오류에 한해 최대 한 번만 재요청한다. 두 번째 결과도 실패하거나 모델 실행, 타임아웃, JSON 파싱, Schema, 참조 무결성 오류가 발생하면 부분 저장하지 않고 기존 계획과 pending 업데이트를 유지한다. 실질적인 diff가 없으면 `no-change`이며 일일 조정 횟수를 차감하지 않는다.

Local Bridge와 클라이언트의 조정 진단 로그에는 `operationId`, mode, attempt, 단계, 프롬프트 문자·바이트 수, Codex 시작·종료 및 실행시간, JSON 파싱시간, 명령 실행시간, 규칙 검증시간, 재시도·Fast Path 여부, 전체 응답시간과 결과 코드만 기록한다. 요청 원문, 학업자료, 개인정보, 캘린더 제목과 인증 정보는 로그 필드 whitelist에서 제외한다.

현재 계획·완료 상태·대기/처리 업데이트·개인화 프로필은 `catchup.planning.v1`에 저장한다. Google Calendar의 정규화 일정과 CatchUp 직접 입력 일정은 `catchup.calendar-events.v1`에서 `source`와 외부 ID로 구분한다. AI 계획 입력에는 현재 4주 범위의 `date`, `startTime`, `endTime`, `isAllDay`, `busy`만 전달하며 개인 일정 제목은 전달하지 않는다.

## 실행과 테스트

Node.js, pnpm, 로그인된 Codex CLI가 필요하다. OpenAI API Key는 필요하지 않다. `pnpm dev`로 Vite와 Local Bridge를 함께 실행하고 `pnpm typecheck`, `pnpm test`, `pnpm build`로 검증한다. 테스트에서는 모델 실행기 인터페이스에 Fake/Stub을 주입하며 외부 모델을 호출하지 않는다. `CATCHUP_BRIDGE_PORT`는 기본값 `4318`을 바꿀 때만 선택적으로 사용한다. 조정 명령 전용 모델은 설치된 Codex CLI가 공식 지원하는 `--model` 옵션을 통해 `CATCHUP_CODEX_ADJUST_MODEL`로 선택하며, 값이 없으면 CLI 기본 모델을 사용한다.
