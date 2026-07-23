# CatchUp Mock Data

## 1. 작성 기준

- 이 문서는 `DATA_MODEL.md` 초안을 바탕으로 만든 화면 구현용 Mock 데이터다.
- 모든 이름, 일정, 과목, 파일명은 가짜 데이터다.
- 업로드 파일 형식은 초기 MVP 기준으로 `PDF`만 사용한다.
- 주간 계획은 월요일부터 일요일까지를 한 주로 본다.
- AI Mate 계획 조정은 같은 주에 최대 3회까지 가능하다.
- Today의 할 일은 사용자가 완료 체크만 할 수 있고, 내용·날짜·우선순위는 직접 수정하지 않는다.

## 2. 데이터 관계 요약

```text
User: user-demo-01
├─ UploadedDocument: doc-demo-01, doc-demo-02, doc-demo-03, doc-demo-04
│  └─ ExtractedItem: extracted-demo-01 ~ extracted-demo-09
├─ CalendarEvent: calendar-demo-01 ~ calendar-demo-07
├─ WeeklyPlan: weekly-plan-demo-01
│  └─ Todo: todo-demo-01 ~ todo-demo-14
└─ PlanAdjustment: adjustment-demo-01, adjustment-demo-02
```

---

## 3. 사용자

| id | displayName | calendarConnectionStatus | weeklyPlanGenerationDay | weeklyPlanGenerationTime | planGenerationRequest |
| --- | --- | --- | --- | --- | --- |
| user-demo-01 | 테스트 학생 | 연결 완료 | 일요일 | 20:00 | 일요일에는 쉬는 시간을 많이 확보해줘. 수요일은 개인 일정이 많으니 가벼운 할 일만 넣어줘. |

---

## 4. 업로드 자료

| id | userId | fileName | documentType | supportedFileFormat | uploadStatus | extractionStatus | uploadedAt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| doc-demo-01 | user-demo-01 | 알고리즘_과제안내.pdf | 과제 명세서 | PDF | 업로드 완료 | 추출 완료 | 2026-07-17 |
| doc-demo-02 | user-demo-01 | 데이터베이스_강의계획서.pdf | 강의계획서 | PDF | 업로드 완료 | 추출 완료 | 2026-07-17 |
| doc-demo-03 | user-demo-01 | 운영체제_LMS공지.pdf | LMS 공지 | PDF | 업로드 완료 | 확인 필요 | 2026-07-17 |
| doc-demo-04 | user-demo-01 | 통계학_중간대체과제.pdf | 과제 명세서 | PDF | 업로드 완료 | 추출 완료 | 2026-07-17 |

---

## 5. AI 추출 학업 정보

| id | documentId | title | itemType | courseName | date | time | submissionMethod | requiredMaterials | difficulty | estimatedDuration | reviewStatus | isUserEdited |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| extracted-demo-01 | doc-demo-01 | 그래프 탐색 구현 과제 | 과제 | 알고리즘 | 2026-07-23 | 23:59 | 온라인 제출 | 소스 코드, 실행 결과 캡처 | 높음 | 4시간 | 확인 완료 | false |
| extracted-demo-02 | doc-demo-01 | 알고리즘 과제 제출 마감 | 마감 | 알고리즘 | 2026-07-23 | 23:59 | 온라인 제출 | 없음 | 높음 | 30분 | 확인 완료 | false |
| extracted-demo-03 | doc-demo-02 | 정규화 개념 퀴즈 | 시험 | 데이터베이스 | 2026-07-25 | 10:00 | LMS 응시 | 교재 4장, 강의 노트 | 보통 | 3시간 | 확인 완료 | true |
| extracted-demo-04 | doc-demo-02 | ERD 실습 준비 | 수업 일정 | 데이터베이스 | 2026-07-22 | 13:00 | 없음 | 노트북, 실습 파일 | 보통 | 1시간 | 확인 완료 | false |
| extracted-demo-05 | doc-demo-03 | 운영체제 보강 공지 | 중요 공지 | 운영체제 | 2026-07-24 | 18:00 | 없음 | 없음 | 낮음 | 30분 | 확인 필요 | false |
| extracted-demo-06 | doc-demo-03 | 프로세스 동기화 복습 | 수업 일정 | 운영체제 | 2026-07-28 | 종일 | 없음 | 강의자료 6주차 | 보통 | 2시간 | 확인 필요 | false |
| extracted-demo-07 | doc-demo-04 | 통계학 미니 리포트 | 과제 | 통계학 | 2026-07-29 | 18:00 | 온라인 제출 | 분석 결과 표, 해석 문단 | 보통 | 3시간 | 확인 완료 | false |
| extracted-demo-08 | doc-demo-04 | 표본분포 연습문제 제출 | 제출 | 통계학 | 2026-07-21 | 23:59 | LMS 과제함 | 연습문제 풀이 파일 | 낮음 | 1시간 | 확인 완료 | false |
| extracted-demo-09 | doc-demo-02 | 데이터베이스 팀 프로젝트 주제 제출 | 제출 | 데이터베이스 | 2026-08-03 | 23:59 | 팀 대표 온라인 제출 | 주제 설명 1페이지 | 보통 | 2시간 | 확인 완료 | false |

---

## 6. Google Calendar 개인 일정

| id | userId | title | date | startTime | endTime | isAllDay | source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| calendar-demo-01 | user-demo-01 | 팀 프로젝트 회의 | 2026-07-20 | 14:00 | 16:00 | false | Google Calendar |
| calendar-demo-02 | user-demo-01 | 아르바이트 | 2026-07-21 | 18:00 | 22:00 | false | Google Calendar |
| calendar-demo-03 | user-demo-01 | 병원 예약 | 2026-07-22 | 10:30 | 11:30 | false | Google Calendar |
| calendar-demo-04 | user-demo-01 | 동아리 정기 모임 | 2026-07-22 | 17:00 | 19:00 | false | Google Calendar |
| calendar-demo-05 | user-demo-01 | 가족 식사 | 2026-07-25 | 18:00 | 20:00 | false | Google Calendar |
| calendar-demo-06 | user-demo-01 | 휴식일 | 2026-07-26 | 00:00 | 23:59 | true | Google Calendar |
| calendar-demo-07 | user-demo-01 | 팀 발표 준비 회의 | 2026-07-30 | 15:00 | 17:00 | false | Google Calendar |

---

## 7. 이번 주 AI 계획

| id | userId | weekStartDate | weekEndDate | status | createdAt | generationRequest | referenceWindow | summary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weekly-plan-demo-01 | user-demo-01 | 2026-07-20 | 2026-07-26 | 생성 완료 | 2026-07-19 20:00 | 일요일에는 쉬는 시간을 많이 확보해줘. 수요일은 개인 일정이 많으니 가벼운 할 일만 넣어줘. | 2026-07-20부터 4주 | 알고리즘 과제와 통계학 제출을 먼저 처리하고, 데이터베이스 퀴즈는 주 후반에 집중 복습하는 계획입니다. |

---

## 8. 날짜별 할 일

| id | weeklyPlanId | sourceExtractedItemId | scheduledDate | title | todoType | courseName | estimatedDuration | priority | isCompleted | recommendationReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| todo-demo-01 | weekly-plan-demo-01 | extracted-demo-01 | 2026-07-20 | 그래프 탐색 과제 요구사항 정리하기 | 과제 진행 | 알고리즘 | 1시간 | 높음 | false | 마감까지 시간이 짧고 구현 범위가 넓어 첫날에 요구사항을 정리하는 것을 추천합니다. |
| todo-demo-02 | weekly-plan-demo-01 | extracted-demo-08 | 2026-07-20 | 표본분포 연습문제 풀이 초안 만들기 | 과제 진행 | 통계학 | 1시간 | 보통 | true | 다음 날 제출 마감이라 오늘 풀이 초안을 끝내두면 부담을 줄일 수 있습니다. |
| todo-demo-03 | weekly-plan-demo-01 | extracted-demo-08 | 2026-07-21 | 표본분포 연습문제 최종 제출하기 | 과제 진행 | 통계학 | 30분 | 높음 | false | 오늘 23:59 제출 마감이므로 제출 확인까지 마치는 것을 추천합니다. |
| todo-demo-04 | weekly-plan-demo-01 | extracted-demo-01 | 2026-07-21 | 그래프 탐색 기본 함수 구현하기 | 과제 진행 | 알고리즘 | 1시간 30분 | 높음 | false | 저녁 개인 일정 전에 핵심 구현을 나누어 진행하면 마감 전 수정 시간을 확보할 수 있습니다. |
| todo-demo-05 | weekly-plan-demo-01 | extracted-demo-04 | 2026-07-22 | ERD 실습 파일 미리 열어보기 | 수업 준비 | 데이터베이스 | 30분 | 보통 | false | 수요일에는 개인 일정이 많아 짧은 준비 작업만 배치했습니다. |
| todo-demo-06 | weekly-plan-demo-01 | extracted-demo-03 | 2026-07-22 | 정규화 핵심 개념 3개만 복습하기 | 시험 공부 | 데이터베이스 | 40분 | 보통 | false | 퀴즈 전 기본 개념을 가볍게 확인하는 정도가 적합한 날입니다. |
| todo-demo-07 | weekly-plan-demo-01 | extracted-demo-01 | 2026-07-23 | 그래프 탐색 과제 테스트 케이스 작성하기 | 과제 진행 | 알고리즘 | 1시간 | 높음 | false | 오늘 과제 마감이므로 제출 전 오류를 줄이는 작업이 필요합니다. |
| todo-demo-08 | weekly-plan-demo-01 | extracted-demo-02 | 2026-07-23 | 알고리즘 과제 제출 확인하기 | 과제 진행 | 알고리즘 | 30분 | 높음 | false | 같은 날 23:59 마감이라 파일 업로드와 제출 상태 확인을 분리했습니다. |
| todo-demo-09 | weekly-plan-demo-01 | extracted-demo-05 | 2026-07-24 | 운영체제 보강 공지 내용 확인하기 | 수업 준비 | 운영체제 | 30분 | 낮음 | false | 공지 확인이 필요한 항목이라 짧게 확인 시간을 배치했습니다. |
| todo-demo-10 | weekly-plan-demo-01 | extracted-demo-03 | 2026-07-24 | 정규화 예제 문제 5개 풀기 | 시험 공부 | 데이터베이스 | 1시간 20분 | 높음 | false | 다음 날 퀴즈가 있어 실제 문제 풀이 시간을 확보했습니다. |
| todo-demo-11 | weekly-plan-demo-01 | extracted-demo-03 | 2026-07-25 | 데이터베이스 퀴즈 전 오답 노트 훑기 | 시험 공부 | 데이터베이스 | 40분 | 높음 | false | 오전 퀴즈 직전에 짧게 복습하도록 배치했습니다. |
| todo-demo-12 | weekly-plan-demo-01 | extracted-demo-07 | 2026-07-25 | 통계학 미니 리포트 자료 모으기 | 과제 진행 | 통계학 | 1시간 | 보통 | false | 다음 주 마감 과제라 주말에 자료 수집만 가볍게 시작하도록 추천합니다. |
| todo-demo-13 | weekly-plan-demo-01 | extracted-demo-07 | 2026-07-26 | 통계학 리포트 분석 방향 메모하기 | 과제 진행 | 통계학 | 40분 | 낮음 | false | 일요일은 휴식 요청이 있어 부담이 적은 메모 작업만 배치했습니다. |
| todo-demo-14 | weekly-plan-demo-01 | extracted-demo-06 | 2026-07-26 | 운영체제 복습 자료 목록만 정리하기 | 복습 | 운영체제 | 30분 | 낮음 | false | 다음 주 복습을 준비하되 휴식 시간을 해치지 않도록 짧게 배치했습니다. |

---

## 9. AI Mate 계획 조정 요청

| id | userId | weeklyPlanId | requestText | requestedAt | status | usedCountThisWeek | remainingCountThisWeek |
| --- | --- | --- | --- | --- | --- | --- | --- |
| adjustment-demo-01 | user-demo-01 | weekly-plan-demo-01 | 수요일에 개인 일정이 많으니 그날 할 일을 줄여줘. | 2026-07-20 21:10 | 조정 완료 | 1 | 2 |
| adjustment-demo-02 | user-demo-01 | weekly-plan-demo-01 | 일요일에는 오래 걸리는 과제 말고 가벼운 정리만 하고 싶어. | 2026-07-24 19:30 | 조정 완료 | 2 | 1 |

---

## 10. Today 화면용 날짜별 보기

### 2026-07-20 월요일

| todoId | title | courseName | estimatedDuration | priority | isCompleted |
| --- | --- | --- | --- | --- | --- |
| todo-demo-01 | 그래프 탐색 과제 요구사항 정리하기 | 알고리즘 | 1시간 | 높음 | false |
| todo-demo-02 | 표본분포 연습문제 풀이 초안 만들기 | 통계학 | 1시간 | 보통 | true |

### 2026-07-21 화요일

| todoId | title | courseName | estimatedDuration | priority | isCompleted |
| --- | --- | --- | --- | --- | --- |
| todo-demo-03 | 표본분포 연습문제 최종 제출하기 | 통계학 | 30분 | 높음 | false |
| todo-demo-04 | 그래프 탐색 기본 함수 구현하기 | 알고리즘 | 1시간 30분 | 높음 | false |

### 2026-07-22 수요일

| todoId | title | courseName | estimatedDuration | priority | isCompleted |
| --- | --- | --- | --- | --- | --- |
| todo-demo-05 | ERD 실습 파일 미리 열어보기 | 데이터베이스 | 30분 | 보통 | false |
| todo-demo-06 | 정규화 핵심 개념 3개만 복습하기 | 데이터베이스 | 40분 | 보통 | false |

### 2026-07-23 목요일

| todoId | title | courseName | estimatedDuration | priority | isCompleted |
| --- | --- | --- | --- | --- | --- |
| todo-demo-07 | 그래프 탐색 과제 테스트 케이스 작성하기 | 알고리즘 | 1시간 | 높음 | false |
| todo-demo-08 | 알고리즘 과제 제출 확인하기 | 알고리즘 | 30분 | 높음 | false |

### 2026-07-24 금요일

| todoId | title | courseName | estimatedDuration | priority | isCompleted |
| --- | --- | --- | --- | --- | --- |
| todo-demo-09 | 운영체제 보강 공지 내용 확인하기 | 운영체제 | 30분 | 낮음 | false |
| todo-demo-10 | 정규화 예제 문제 5개 풀기 | 데이터베이스 | 1시간 20분 | 높음 | false |

### 2026-07-25 토요일

| todoId | title | courseName | estimatedDuration | priority | isCompleted |
| --- | --- | --- | --- | --- | --- |
| todo-demo-11 | 데이터베이스 퀴즈 전 오답 노트 훑기 | 데이터베이스 | 40분 | 높음 | false |
| todo-demo-12 | 통계학 미니 리포트 자료 모으기 | 통계학 | 1시간 | 보통 | false |

### 2026-07-26 일요일

| todoId | title | courseName | estimatedDuration | priority | isCompleted |
| --- | --- | --- | --- | --- | --- |
| todo-demo-13 | 통계학 리포트 분석 방향 메모하기 | 통계학 | 40분 | 낮음 | false |
| todo-demo-14 | 운영체제 복습 자료 목록만 정리하기 | 운영체제 | 30분 | 낮음 | false |

---

## 11. Month 화면용 주요 일정 보기

| date | type | title | courseName | sourceId |
| --- | --- | --- | --- | --- |
| 2026-07-20 | 개인 일정 | 팀 프로젝트 회의 | 없음 | calendar-demo-01 |
| 2026-07-21 | 마감 | 표본분포 연습문제 제출 | 통계학 | extracted-demo-08 |
| 2026-07-21 | 개인 일정 | 아르바이트 | 없음 | calendar-demo-02 |
| 2026-07-22 | 수업 일정 | ERD 실습 준비 | 데이터베이스 | extracted-demo-04 |
| 2026-07-22 | 개인 일정 | 병원 예약 | 없음 | calendar-demo-03 |
| 2026-07-22 | 개인 일정 | 동아리 정기 모임 | 없음 | calendar-demo-04 |
| 2026-07-23 | 마감 | 알고리즘 과제 제출 마감 | 알고리즘 | extracted-demo-02 |
| 2026-07-24 | 중요 공지 | 운영체제 보강 공지 | 운영체제 | extracted-demo-05 |
| 2026-07-25 | 시험 | 정규화 개념 퀴즈 | 데이터베이스 | extracted-demo-03 |
| 2026-07-25 | 개인 일정 | 가족 식사 | 없음 | calendar-demo-05 |
| 2026-07-26 | 개인 일정 | 휴식일 | 없음 | calendar-demo-06 |
| 2026-07-28 | 수업 일정 | 프로세스 동기화 복습 | 운영체제 | extracted-demo-06 |
| 2026-07-29 | 과제 | 통계학 미니 리포트 | 통계학 | extracted-demo-07 |
| 2026-07-30 | 개인 일정 | 팀 발표 준비 회의 | 없음 | calendar-demo-07 |
| 2026-08-03 | 제출 | 데이터베이스 팀 프로젝트 주제 제출 | 데이터베이스 | extracted-demo-09 |

---

## 12. 상태별 테스트 케이스

| 화면 | 확인할 상황 | 사용할 데이터 |
| --- | --- | --- |
| Upload | 추출 완료 자료 | doc-demo-01, doc-demo-02, doc-demo-04 |
| Upload | 사용자 확인이 필요한 자료 | doc-demo-03, extracted-demo-05, extracted-demo-06 |
| AI Mate | 주간 계획 생성 완료 | weekly-plan-demo-01 |
| AI Mate | 계획 조정 가능 횟수 1회 남음 | adjustment-demo-02 |
| Today | 완료된 할 일이 섞인 날짜 | 2026-07-20, todo-demo-02 |
| Today | 개인 일정이 많아 짧은 할 일만 있는 날짜 | 2026-07-22 |
| Month | 학업 일정과 개인 일정이 같은 날 있는 날짜 | 2026-07-21, 2026-07-22, 2026-07-25 |
