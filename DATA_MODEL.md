# CatchUp MVP 데이터 모델

## 1. 문서 목적과 적용 범위

이 문서는 CatchUp MVP의 실제 API와 관계형 DB 구현에 사용할 **논리 데이터 모델**이다. 화면에서 사용하는 API 필드명은 `API_SPEC.md`를 따르고, DB는 아래의 `snake_case` 테이블·컬럼명으로 저장한다. 예시는 모두 익명화된 목 데이터다.

이 모델은 다음 MVP만 다룬다.

- PDF·이미지 업로드와 AI 추출 결과의 사용자 검토·수정
- Google Calendar 읽기 연동과 CatchUp 내 개인 일정 추가·수정·삭제
- 사용자가 요청한 날짜부터 정확히 7일인 Plan 생성
- Today의 월~일 Calendar Week 조회와 Plan 기간의 분리
- AI Mate를 통한 계획 조정(사용자당 KST 기준 하루 최대 10회)
- Today 완료 체크와 Month/Today 일정 조회

Google OAuth access/refresh token, API 키, 실제 파일 원문은 일반 DB 응답이나 클라이언트에 저장·반환하지 않는다. OAuth 비밀값은 암호화된 비밀 저장소에, 파일은 접근 제어된 객체 스토리지에 보관하고 DB에는 참조 키만 둔다.

## 2. 공통 규칙

| 항목 | 규칙 |
| --- | --- |
| PK | 모든 `id`는 UUID 또는 충돌 없는 문자열 ID를 사용한다. |
| 소유권 | 사용자 소유 리소스는 모두 `user_id`를 가져야 하며, API는 인증 세션의 사용자와 일치하는 행만 조회·변경한다. |
| 시각 | 생성·수정·동기화 시각은 `timestamptz`(UTC 저장)로, 화면에서는 사용자 시간대(초기값 `Asia/Seoul`)로 변환한다. |
| 날짜/시간 | 날짜는 `date`, 시간만 있는 값은 `time`, 실제 일정의 시작·종료는 `timestamptz`를 사용한다. 종일 일정은 시간 값을 `NULL`로 둔다. |
| 열거형 | DB enum 또는 `CHECK` 제약으로 제한한다. API는 `API_SPEC.md`의 kebab-case 값을, DB는 snake_case 값을 사용해도 된다. |
| 삭제 | 계획·조정·추출 근거는 감사와 재현성을 위해 물리 삭제하지 않는다. CatchUp 직접 일정은 `deleted_at` 소프트 삭제를 권장한다. |
| 개인정보 | 실제 학생 정보·일정은 최소 범위로 저장한다. 로그, AI 프롬프트, 오류 메시지에 OAuth 비밀값이나 원문 파일을 남기지 않는다. |

## 3. 관계 개요

```text
users
├─ plan_generation_preferences
├─ calendar_connections ──< calendar_events
├─ uploaded_documents ──< extracted_items ──< extracted_item_revisions
├─ plans ──< plan_revisions ──< todos ──< todo_sources
├─ ai_mate_requests
└─ daily_adjustment_usages
```

- `extracted_items`와 `calendar_events`는 Month/Today 일정 및 계획 생성의 입력이다.
- `plans`는 `plan_start_date` 기준으로 식별하고, 계획 범위는 `plan_start_date ~ plan_start_date + 6일`이다. 조정 시 새 `plan_revisions`를 만든다.
- `todos`는 현재 유효한 계획 버전의 항목이다. 사용자는 완료 상태만 바꾼다.
- `ai_mate_requests`는 대화/실행 감사 기록이고, `daily_adjustment_usages`는 일일 10회 제한을 안전하게 집계한다.

## 4. 테이블 정의

### 4.1 `users`

인증 공급자가 식별한 사용자와 화면 기본 정보를 저장한다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `auth_subject` | text | 인증 시스템의 안정적인 사용자 식별자, `UNIQUE` |
| `display_name` | text | 화면 표시명, 선택값 |
| `time_zone` | text | 기본값 `Asia/Seoul` |
| `created_at`, `updated_at` | timestamptz | 서버가 기록 |

API의 `GET /me`에 쓰이는 `calendarConnectionStatus`, 기본 계획 요청사항, 조정 잔여 횟수는 각각 아래 테이블에서 조합한다. 클라이언트가 `userId`를 요청 본문으로 보내지 않는다.

### 4.2 `plan_generation_preferences`

사용자별 주간 계획 생성 설정이다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `user_id` | uuid | PK, FK → `users.id` |
| `default_generation_request` | text | 선택값, 기본 자연어 요청 |
| `updated_at` | timestamptz | 서버가 기록 |

이 테이블은 자동 생성 스케줄을 저장하지 않는다. 기본 요청사항만 저장하며, 실제 계획 시작일은 각 생성 요청 시점으로 결정한다.

### 4.3 `calendar_connections`

Google Calendar 연결 상태와 동기화 메타데이터다. Google 외 공급자는 MVP에서 허용하지 않는다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id`, `UNIQUE` |
| `provider` | text | `google_calendar`만 허용 |
| `status` | text | `disconnected`, `connecting`, `connected`, `failed`, `revoked` |
| `external_account_id` | text | Google 계정의 공급자 식별자, 토큰 아님 |
| `secret_ref` | text | 암호화된 토큰이 있는 비밀 저장소 참조. API로 반환 금지 |
| `sync_cursor` | text | 증분 동기화 토큰/커서, API로 반환 금지 |
| `last_synced_at`, `created_at`, `updated_at` | timestamptz | 서버가 기록 |

`UNIQUE(user_id, provider)`를 둔다. OAuth `state`는 별도 단기 세션/캐시에 저장하고 소모 후 폐기한다.

### 4.4 `calendar_events`

Google에서 읽어온 일정과 CatchUp에서 직접 만든 개인·수업 일정을 함께 저장한다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id` |
| `connection_id` | uuid | Google 일정이면 FK → `calendar_connections.id`, 직접 입력이면 `NULL` |
| `source` | text | `google_calendar` 또는 `catchup` |
| `external_event_id` | text | Google 일정의 원본 ID, 직접 입력이면 `NULL` |
| `title` | text | 필수 |
| `event_type` | text | `personal` 또는 `class` |
| `starts_at`, `ends_at` | timestamptz | 시간 일정. 종일이면 `NULL` |
| `event_date` | date | 종일 일정 또는 API 날짜 조회 보조값 |
| `is_all_day` | boolean | 기본값 `false` |
| `source_updated_at` | timestamptz | Google 원본 수정 시각, 선택값 |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | `deleted_at`은 CatchUp 일정에만 사용 |

제약: `is_all_day=true`이면 `event_date`는 필수이고 `starts_at`·`ends_at`은 `NULL`; 시간 일정이면 `starts_at < ends_at`이며 `event_date`는 `starts_at`의 사용자 현지 날짜로 채운다. `UNIQUE(connection_id, external_event_id)`로 동기화 중복을 막는다. API는 `source=catchup`인 행만 수정·삭제할 수 있다.

### 4.5 `uploaded_documents`

업로드 파일의 메타데이터와 추출 작업 상태다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id` |
| `file_name` | text | 화면에 보여 줄 원본 파일명 |
| `mime_type` | text | `application/pdf` 또는 허용 이미지 MIME |
| `size_bytes` | bigint | `> 0` |
| `storage_key` | text | 객체 스토리지 키, `UNIQUE`, 클라이언트에 직접 공개 금지 |
| `document_type` | text | `syllabus`, `lms_notice`, `assignment_brief`, `other` |
| `upload_status` | text | `uploading`, `complete`, `failed` |
| `extraction_status` | text | `pending`, `processing`, `complete`, `needs_review`, `failed` |
| `extraction_error_code` | text | 실패 시 안전한 코드만 저장, 선택값 |
| `uploaded_at`, `created_at`, `updated_at` | timestamptz | 서버가 기록 |

PDF와 이미지 이외에는 업로드 전에 거절한다. `storage_key`의 실제 파일은 소유권 확인이 된 짧은 만료 URL로만 내려준다.

### 4.6 `extracted_items`와 `extracted_item_revisions`

`extracted_items`는 문서에서 찾아낸 과제·시험·마감·제출·중요 공지·수업 일정의 현재 확정값이다. 하나의 항목은 한 날짜/시간을 중심으로 하므로, 과제와 마감처럼 별개 일정을 표현해야 하면 항목을 분리하고 `related_item_id`로 연결한다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | uuid | PK |
| `document_id` | uuid | FK → `uploaded_documents.id` |
| `related_item_id` | uuid | self FK, 선택값 |
| `title`, `course_name` | text | 제목은 필수, 과목명은 선택값 |
| `item_type` | text | `assignment`, `exam`, `deadline`, `submission`, `important_notice`, `class_schedule` |
| `scheduled_date`, `scheduled_time` | date, time | 불명확하면 `NULL`; 종일은 시간 `NULL` |
| `submission_method`, `required_materials` | text | 선택값 |
| `difficulty` | text | `low`, `medium`, `high`, 선택값 |
| `estimated_duration_minutes` | integer | `> 0`, 선택값 |
| `review_status` | text | `needs_review`, `confirmed` |
| `ai_confidence` | numeric(3,2) | 0~1, 화면 표시용이 아닌 검토 판단용 |
| `ai_extracted_payload` | jsonb | 원본 구조화 응답, 서버 전용 감사용 |
| `current_revision_no` | integer | 1 이상 |
| `created_at`, `updated_at` | timestamptz | 서버가 기록 |

`extracted_item_revisions`에는 `id`, `extracted_item_id`, `revision_no`, `changed_by`(`ai`/`user`), `snapshot jsonb`, `created_at`을 저장하고 `UNIQUE(extracted_item_id, revision_no)`를 둔다. 사용자가 수정·확정하면 새 revision을 기록하고 `review_status=confirmed`로 바꾼다. API의 `isUserEdited`는 `changed_by=user`인 revision 존재 여부로 계산하거나 캐시 컬럼으로 제공한다.

### 4.7 `plans`, `plan_revisions`, `todos`, `todo_sources`

`plans`는 7일 Plan의 고정 식별자, `plan_revisions`는 생성·조정 결과의 버전, `todos`는 현재 버전에 속하는 실행 항목이다.

| 테이블 | 핵심 컬럼 | 제약/설명 |
| --- | --- | --- |
| `plans` | `id`, `user_id`, `plan_start_date`, `plan_end_date`, `status`, `generation_request`, `reference_window_end_date`, `summary`, `created_at` | `plan_end_date = plan_start_date + 6일`. 같은 요청의 중복 처리는 `client_request_id` 또는 생성 트랜잭션으로 막는다. 상태는 `generating`, `complete`, `failed`만 저장한다. |
| `plan_revisions` | `id`, `plan_id`, `revision_no`, `kind`, `source_request_id`, `summary`, `created_at` | `kind`: `initial`/`adjustment`; `UNIQUE(plan_id, revision_no)`. 조정 전후를 재현한다. |
| `todos` | `id`, `plan_id`, `plan_revision_id`, `scheduled_date`, `title`, `todo_type`, `course_name`, `estimated_duration_minutes`, `priority`, `is_completed`, `completed_at`, `recommendation_reason`, `created_at` | 날짜는 해당 Plan의 `plan_start_date ~ plan_end_date` 안. `todo_type`: `assignment_work`, `exam_study`, `class_prep`, `review_preview`. `priority`: `low`/`medium`/`high`. |
| `todo_sources` | `todo_id`, `extracted_item_id` | 복수 학업 근거를 연결하는 조인 테이블. PK는 `(todo_id, extracted_item_id)`. |

현재 화면에는 최신 revision의 `todos`만 제공한다. 이전 revision의 Todo는 삭제하지 않고 보존한다. 완료 체크는 최신 Todo의 `is_completed`, `completed_at`만 변경하며 자동 재조정은 수행하지 않는다. Plan 기간이 끝나도 완료 체크되지 않은 Todo는 미완료 과제로 보존하고, 다음 Plan 생성 요청에서 입력값으로 다시 사용한다. API의 단일 `sourceExtractedItemId`는 `todo_sources`의 대표 근거를 반환하는 호환 필드이며, 새 API는 `sourceExtractedItemIds`도 반환하는 것이 안전하다.

### 4.8 `ai_mate_requests`와 `daily_adjustment_usages`

AI Mate 입력과 실행 결과, 그리고 조정 10회 제한을 분리한다. 요청 행에 `usedCountToday`를 중복 저장하지 않는다.

| 테이블 | 핵심 컬럼 | 제약/설명 |
| --- | --- | --- |
| `ai_mate_requests` | `id`, `user_id`, `plan_id`, `client_request_id`, `intent`, `request_text`, `status`, `response_text`, `plan_revision_id`, `requested_at`, `completed_at`, `error_code` | `intent`: `generate_plan`, `adjust_plan`, `explain_recommendation`, `help`. `status`: `processing`, `complete`, `rejected`, `failed`. `UNIQUE(user_id, client_request_id)`로 재시도 중복을 방지한다. |
| `daily_adjustment_usages` | `user_id`, `usage_date`, `used_count`, `updated_at` | PK `(user_id, usage_date)`, `CHECK(used_count BETWEEN 0 AND 10)`. `usage_date`는 사용자 시간대의 날짜다. |

계획 조정은 한 DB 트랜잭션에서 사용량 행을 잠그고 `used_count < 10`인지 검사한 뒤, 조정 결과와 새 계획 revision이 성공적으로 저장될 때만 1 증가시킨다. 실패·추천 설명·도움말은 사용량을 차감하지 않는다. 잔여 횟수는 `10 - used_count`로 계산한다.

## 5. API 계약과의 매핑

`API_SPEC.md`의 리소스 이름은 아래처럼 이 모델에 매핑한다.

| API 리소스 | DB 기준 | 구현 메모 |
| --- | --- | --- |
| `User` / `/me` | `users` + `plan_generation_preferences` + `calendar_connections` + `daily_adjustment_usages` | 조합 응답이며 사용자 ID는 세션에서 얻는다. |
| `CalendarEvent` | `calendar_events` | `date`, `startTime`, `endTime`은 사용자 시간대로 직렬화한다. |
| `UploadedDocument` | `uploaded_documents` | `storage_key`·오류 상세는 노출하지 않는다. |
| `ExtractedItem` | `extracted_items`의 현재 revision | API의 `date`/`time`은 `scheduled_date`/`scheduled_time`에서 만든다. |
| `Plan` | `plans` + 최신 `plan_revisions` | `planStartDate`, `planEndDate`, `referenceWindowEndDate`를 사용한다. |
| `Todo` | 최신 revision의 `todos` + `todo_sources` | 완료 변경 외 일반 CRUD를 제공하지 않는다. |
| `PlanAdjustment` | `ai_mate_requests(intent=adjust_plan)` | 사용량 수치는 `daily_adjustment_usages`에서 계산한다. |

## 6. 필수 제약·인덱스·트랜잭션

### 서버 검증

- 계획 생성 범위는 사용자 시간대 기준 요청일(`plan_start_date`)부터 6일 뒤까지다. 계획 생성 시점부터 향후 약 4주간의 확정 학업 일정과 개인 일정을 입력으로 사용한다.
- 생성 시 서버가 요청일과 `plan_end_date = plan_start_date + 6일`을 계산한다. 클라이언트가 보낸 범위를 그대로 신뢰하지 않는다.
- 동일한 생성 요청의 중복은 `client_request_id`와 생성 트랜잭션으로 막는다. Calendar Week의 월요일 시작 여부는 Plan 저장 규칙에 사용하지 않는다.
- 완료 체크되지 않은 이전 Todo는 다음 Plan 생성 입력에 다시 포함한다.
- `review_status=needs_review`인 추출 항목은 Today/Month의 일반 일정과 계획 생성 입력에서 제외한다.
- AI 결과는 저장 전에 사용자 소유권, enum, 날짜·시간, Plan 범위, 예상 시간, 참조 학업 항목을 검증한다.
- AI는 직접 SQL·파일 경로·OAuth 비밀값에 접근하지 않는다. 서버가 최소 필요 입력을 제공하고 구조화 결과만 검증해 저장한다.

### 권장 인덱스

```text
calendar_events(user_id, event_date) WHERE deleted_at IS NULL
calendar_events(connection_id, external_event_id) UNIQUE
uploaded_documents(user_id, uploaded_at DESC)
extracted_items(document_id, review_status, scheduled_date)
plans(user_id, plan_start_date)
todos(plan_id, plan_revision_id, scheduled_date)
ai_mate_requests(user_id, client_request_id) UNIQUE
daily_adjustment_usages(user_id, usage_date) PRIMARY KEY
```

## 7. 구현 순서와 검증 체크리스트

1. 인증 세션과 `users`, 주간 설정, Google 연결 상태를 먼저 구현한다.
2. 파일 스토리지 참조·문서·추출 항목·revision을 구현하고 사용자 수정/확정을 검증한다.
3. Google 읽기 동기화와 CatchUp 직접 일정 CRUD를 구현한다.
4. 요청일 기준 7일 Plan 생성 트랜잭션과 중복 요청 제어를 구현한다.
5. AI Mate 조정의 idempotency(`client_request_id`), revision 저장, 일일 사용량 잠금/제한을 구현한다.
6. Today/Month 조회가 소유권·확정 상태·시간대를 올바르게 반영하는지 확인한다.

다음은 실제 연결 전 최소 검증 항목이다.

- 같은 생성 요청을 동시 두 번 보내도 동일한 Plan이 중복 생성되지 않는가?
- 같은 `clientRequestId` 재시도로 조정 횟수와 revision이 중복 생성되지 않는가?
- 10번째 성공 조정 뒤 11번째 요청이 `429 AI_ADJUSTMENT_LIMIT_REACHED`가 되는가?
- Google 일정은 읽기 전용이고 CatchUp 직접 일정만 수정·삭제되는가?
- 확인 필요 추출 항목이 계획 생성·Today·Month 조회에 섞이지 않는가?
- 종일/시간 일정, KST 자정, Plan 범위 경계와 월요일 Calendar Week 경계에서 날짜가 바르게 표시되는가?
- OAuth 토큰, `secret_ref`, `storage_key`, 실제 원문이 API 응답·로그에 노출되지 않는가?
