# Catchup

## 프로젝트 이름

Catchup

## 팀명

Catchup

## 팀원소개

- 김세희
- 박솔비
- 심여진

## 한 줄 소개

Google Calendar를 사용하는 대학생의 강의계획서, LMS 공지, 과제, 시험, 개인 일정을 AI가 정리해 오늘과 이번 주에 해야 할 일을 추천해주는 웹앱 기반 학업 일정 매니저입니다.

## 해결하려는 문제

대학생은 학업 일정과 개인 일정이 여러 채널에 흩어져 있어 중요한 마감일을 놓치거나 무엇부터 해야 할지 판단하기 어렵습니다.

## 타깃 사용자

- Google Calendar를 사용하는 여러 과목 수강 대학생
- LMS 공지와 강의계획서를 자주 확인해야 하는 학생
- 과제, 시험, 개인 일정을 함께 관리해야 하는 학생
- 일정 관리가 어렵거나 마감 직전에 몰아서 하는 학생

## 1차 MVP 범위

- 강의계획서, LMS 공지, 과제 명세서 등 학업 자료 업로드
- PDF와 이미지 파일 형식 지원
- AI 기반 과제명, 마감일, 시험일, 제출 방식, 중요 일정 추출
- 추출된 정보 확인 및 수정
- Google Calendar 기반 주간 학습 계획 생성
- CatchUp 안에서 개인 일정 직접 추가 및 수정
- 사용자가 설정한 요일과 시간에 주 1회만 주간 계획 생성
- 한 주의 계획 범위는 월요일부터 일요일까지로 제한
- 계획 생성 시 자연어 요구사항 입력
- 현재 상태 기준 앞으로 4주 일정을 참고해 이번 주 계획 생성
- 완료한 일 제거, 미완료 항목 재배치 중심의 주간 계획 반영
- AI Mate를 통한 일일/주간 계획 조정 요청
- AI Mate 계획 조정 요청은 하루에 최대 10번만 가능
- 추천 계획에 대한 간단한 근거 설명
- Month 날짜 칸에 일정 제목 표시
- 6색 제한 팔레트로 과목별·개인 일정 카테고리 구분 및 카테고리 전체 색상 변경

## 초기 구현 이후 추가 검토 기능

- 일정 요약 캘린더에서 확인 필요 일정을 일반 일정과 다르게 표시하는 기능

## 현재 폴더에 남아야 할 파일 목록

- `README.md`: 프로젝트 소개 문서
- `PRD.md`: MVP 제품 요구사항 문서
- `AGENTS.md`: Codex 작업 규칙 문서
- `IA.md`: 정보 구조 문서
- `USER_FLOW.md`: 사용자 흐름 문서
- `SCREEN_SPEC.md`: 화면 상세 명세 문서
- `USER_TEST_SCENARIOS.md`: 팀원이 학생 역할로 직접 따라 해보는 최신 서비스 행동 시나리오
- `FIRST_DESIGN.md`: 브랜드 인트로 화면 디자인·구현 명세
- `ONBOARDING_DESIGN.md`: Google Calendar 연동 화면 디자인·구현 명세

## 다음에 Codex에게 맡길 작업 3개

1. `SCREEN_SPEC.md`를 바탕으로 화면별 와이어프레임을 작성해줘.
2. MVP 구현을 위한 데이터 모델과 API 구조 초안을 작성해줘.
3. AI 정보 추출, 4주 윈도우 기반 주간 계획 생성, 챗봇 기반 계획 조정, 추천 근거 설명에 사용할 프롬프트 초안을 작성해줘.

## 로컬 실행 및 검증

Node.js, pnpm, 로그인된 `codex` CLI가 필요하다. OpenAI API Key는 사용하지 않는다.

```bash
pnpm dev
```

`pnpm dev`는 Vite 화면 서버와 Local Bridge를 함께 실행한다. 개발 중 서버 코드가 바뀌면 Bridge도 watch 모드로 자동 재시작된다. 따로 실행해야 할 때만 `pnpm dev:frontend`와 `pnpm dev:bridge`를 각각 사용한다. Bridge 상태는 `http://127.0.0.1:4318/health`에서 확인한다. Frontend 프록시와 Bridge는 기본 포트 `4318`을 함께 사용한다.

```bash
pnpm typecheck
pnpm test
pnpm build
```

업로드 파일은 OS 임시 디렉터리에서 처리 후 삭제되며, 구조화된 확정·미확정 학업 이벤트와 원본 출처 정보만 브라우저 Local Storage에 저장된다. 이후 자료 분석 시 기존 미확정 이벤트를 함께 비교해 동일 이벤트의 부족한 정보를 보완한다.

## Google Calendar 읽기 전용 연결

Google Cloud Console에서 Google Calendar API와 OAuth 동의 화면을 설정한 뒤 `웹 애플리케이션` OAuth Client ID를 생성한다. 승인된 리디렉션 URI에는 아래 주소를 정확히 등록한다.

```text
http://localhost:4318/api/google-calendar/oauth/callback
```

`.env.example`을 참고해 로컬 `.env`에 다음 값을 설정한다. 실제 Client ID, Client Secret, access token, refresh token은 Git에 커밋하지 않는다.

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4318/api/google-calendar/oauth/callback
```

Bridge 포트를 바꾸면 `CATCHUP_BRIDGE_PORT`, Vite 프록시, Google Cloud에 등록한 `GOOGLE_REDIRECT_URI`가 같은 포트를 가리켜야 한다. OAuth 동의 화면이 테스트 상태라면 사용할 Google 계정을 테스트 사용자로 등록한다. 앱의 연결 버튼은 일정 이벤트와 캘린더 목록의 읽기 전용 권한만 요청하며 Google Calendar에 일정 생성·수정·삭제 요청을 보내지 않는다.

최초 연결은 Google 계정의 기본(primary) 캘린더에서 연결 시점부터 6개월 뒤까지의 고정 범위를 저장하고 반복 일정을 실제 발생 건으로 펼쳐 가져온다. 이후에는 저장한 `syncToken`으로 추가·수정·삭제만 증분 동기화한다. token이 만료되어 Google이 `410 Gone`을 반환하면 처음 저장한 동일 범위를 다시 조회한다. 일시적인 API 실패 때는 브라우저에 마지막으로 저장된 Google 일정과 CatchUp 직접 입력 일정을 유지한다.

OAuth access/refresh token과 syncToken은 브라우저에 전달하지 않고 Local Bridge가 기본적으로 `~/.catchup/google-calendar-session.json`에 소유자 전용 권한(`0600`)으로 저장한다. 브라우저 Local Storage에는 화면과 계획에 필요한 정규화 일정만 저장한다. 연결 해제 시 서버 token과 Google 출처 일정만 제거하며 CatchUp 직접 입력 일정은 유지한다.

Google의 `start.date` 일정만 실제 종일 일정으로 처리한다. `start.dateTime` 일정은 해당 시간대만 점유하고, 날짜만 확인된 CatchUp 학업 이벤트의 `시간 없음` 상태와 구분한다. 6개월치 Google 일정 전체를 Codex에 보내지 않으며 현재 4주 범위의 제목 없는 busy block만 계획 입력에 포함한다.

## AI 주간계획 구조

최초 생성과 자동 업데이트는 `Vite -> Local Bridge -> codex exec -> weekly-plan JSON Schema -> 애플리케이션 절대 규칙 검증` 흐름을 사용한다. AI Mate의 사용자 조정은 더 작은 전용 흐름을 사용한다. 날짜 이동, 마감 전 재분배, 분할, 시간·요일 한도처럼 대상과 조건이 명확한 요청은 Fast Path가 Codex 호출 없이 처리한다. 모호하거나 복합적인 요청만 Local Bridge가 Codex로 보내며, Codex는 전체 계획이 아니라 `plan-adjustment.schema.json`의 변경 명령만 반환한다. 실제 날짜 배치와 최소 diff 적용은 애플리케이션이 수행한다.

두 조정 경로 모두 확정 이벤트 참조, 7일 범위, 마감, 개인·수업 일정 충돌, 일일 capacity, 요일별 개수, 금지 요일, dependency, 완료 항목과 관련 없는 항목 보존을 검사한 뒤에만 Local Storage에 저장한다. 코드로 해결할 수 없는 충돌은 모델을 다시 부르지 않고 기존 계획을 유지한다. 존재하지 않는 대상이나 해석 불가능한 명령처럼 자연어 재해석이 필요한 경우에만 최대 한 번 재요청한다. 성공한 실제 변경만 하루 10회 한도에 반영하며 실패와 `no-change`는 차감하지 않는다.

최초 생성·자동 업데이트의 첫 초안이 실패하면 구조화된 위반 목록을 포함해 한 번만 재생성한다. 두 번째 초안도 실패하거나 모델 실행·타임아웃·JSON 오류가 발생하면 기존 계획과 pending 업데이트를 유지한다. 테스트에서는 외부 모델을 호출하지 않고 모델 실행기 인터페이스에 Fake/Stub을 주입한다.

Google Calendar 연결에는 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`가 필요하다. Bridge 포트를 바꿀 때는 `CATCHUP_BRIDGE_PORT`도 함께 설정한다. 조정 명령에만 다른 Codex 모델을 사용하려면 `CATCHUP_CODEX_ADJUST_MODEL`을 선택적으로 설정한다. 값이 없으면 로그인된 Codex CLI의 기본 모델을 사용하며, 설치된 CLI가 지원하지 않는 모델이면 계획을 바꾸지 않고 명확한 실행 오류를 표시한다. 별도 reasoning 설정은 추측해 추가하지 않았다. Codex CLI 로그인 상태는 `codex login status`로 확인할 수 있고 OpenAI API Key나 외부 AI SDK는 사용하지 않는다. 세부 요청·응답과 검증 정책은 `API_SPEC.md`를 참고한다.
