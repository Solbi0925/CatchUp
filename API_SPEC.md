# CatchUp Local Bridge API

## 목적과 범위

이번 API는 학업자료 다중 업로드와 이벤트 중심 통합 분석만 담당한다. 별도 DB, 클라우드 백엔드, OpenAI API Key를 사용하지 않는다.

```text
Vite Frontend -> Local Bridge -> codex exec -> JSON Schema 검증 -> 이벤트 중심 결과
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

Bridge는 요청마다 OS 임시 디렉터리를 만들고 종료 시 삭제한다. 원본 파일은 저장하지 않으며 확정·미확정 구조화 이벤트는 브라우저의 `catchup.academic-events.v2`에 저장한다.

## 최초 주간계획의 로컬 처리

최초 7일 계획은 별도 서버 API나 DB를 추가하지 않고 브라우저 애플리케이션 로직에서 생성한다. `AcademicEvent`와 `Todo`는 분리하며, 계획·완료 상태·개인화 프로필은 `catchup.planning.v1`에 저장한다. 실제 Google Calendar API와 기존 계획 수정/업데이트 API는 이 단계 범위에 포함하지 않는다.
