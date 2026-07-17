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

강의계획서, LMS 공지, 과제, 시험, 개인 일정을 AI가 정리하고 앞으로 4주간의 일정을 참고해 오늘과 이번 주에 해야 할 일을 추천해주는 학업 일정 매니저입니다.

## 해결하려는 문제

대학생은 학업 일정과 개인 일정이 여러 채널에 흩어져 있어 중요한 마감일을 놓치거나 무엇부터 해야 할지 판단하기 어렵습니다.

## 타깃 사용자

- 여러 과목을 동시에 듣는 대학생
- LMS 공지와 강의계획서를 자주 확인해야 하는 학생
- 과제, 시험, 개인 일정을 함께 관리해야 하는 학생
- 일정 관리가 어렵거나 마감 직전에 몰아서 하는 학생

## 1차 MVP 범위

- React Native + Expo 모바일 앱
- 온보딩 및 Google Calendar 읽기 전용 OAuth 연결 흐름
- 하단 탭 Today / Month / Upload
- mock calendar data 기반 오늘 및 월간 일정 표시
- 모든 메인 화면의 AI Mate 플로팅 버튼

- 강의계획서, LMS 공지, 과제 명세서, 시간표 파일 업로드
- 최초 구현은 PDF 또는 이미지 중 한 가지 형식부터 지원
- AI 기반 과제명, 마감일, 시험일, 제출 방식, 중요 일정 추출
- 추출된 정보 확인 및 수정
- Google Calendar 또는 개인 시간표 기반 일일/주간 학습 계획 생성
- 앞으로 4주간의 마감일, 시험일, 제출일을 참고한 주간 계획 생성
- 완료 체크 후 남은 일정 기본 재정렬
- 횟수 제한이 있는 AI 챗봇 계획 수정 요청
- 추천 계획에 대한 간단한 근거 설명

## 해커톤 구현 방식

- 서비스에서는 외부 AI API를 호출하지 않는다.
- 직접 모델 학습도 이번 범위에 포함하지 않는다.
- Codex `exec`는 개발·검증과 데모용 샘플 및 규칙 기반 처리 로직 작성에 사용한다.
- 업로드 예시와 테스트 데이터는 익명화된 가짜 자료만 사용한다.
- AI API 연동과 모델 학습은 후속 확장 범위로 둔다.

## 실행 방법

현재 프로젝트는 Expo SDK 54 기준이며, iPhone의 Expo Go SDK 54에서 실행할 수 있다.

```bash
pnpm install
pnpm start
```

현재 앱은 Google OAuth client ID가 없으면 개인정보 없는 데모 모드로 진입한다. 실제 OAuth를 연결하려면 `app.json`의 `expo.extra.googleCalendarClientId`에 Google OAuth client ID를 넣고, Google Cloud Console에서 `calendar.readonly` 범위와 Expo redirect URI를 설정한다. 앱은 이 MVP에서 토큰을 DB나 로컬 저장소에 저장하지 않는다.

### Google Calendar 연동 준비

1. Google Cloud Console에서 새 프로젝트를 만든다.
2. API Library에서 Google Calendar API를 활성화한다.
3. OAuth consent screen에서 앱 이름과 테스트 사용자 계정을 설정한다.
4. Credentials에서 iOS용 OAuth client ID를 만든다. Bundle ID는 `com.catchup.mobile`을 사용한다.
5. 발급된 client ID를 `app.json`에 입력한다.

```json
{
  "expo": {
    "extra": {
      "googleCalendarClientId": "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"
    }
  }
}
```

앱은 `https://www.googleapis.com/auth/calendar.readonly`만 요청한다. 일정 생성·수정 권한은 요청하지 않으며, access token은 이 MVP에서 저장하지 않는다. Expo Go에서는 화면과 데모 모드를 확인하고, 실제 OAuth redirect 테스트는 `catchup` scheme이 포함된 development build에서 진행한다.

```bash
pnpm ios
pnpm android
```

## 현재 폴더에 남아야 할 파일 목록

- `README.md`: 프로젝트 소개 문서
- `PRD.md`: MVP 제품 요구사항 문서
- `AGENTS.md`: Codex 작업 규칙 문서
- `IA.md`: MVP 화면 구조 문서
- `FLOW.md`: 사용자 흐름과 실패 상태 문서
- `SCREEN_SPEC.md`: 화면별 요소와 상태 정의 문서

## 다음에 Codex에게 맡길 작업 3개

1. `PRD.md`를 바탕으로 화면별 와이어프레임과 사용자 흐름을 작성해줘.
2. MVP 구현을 위한 데이터 모델과 API 구조 초안을 작성해줘.
3. AI 정보 추출, 4주 참고 주간 계획 생성, 챗봇 수정 요청, 추천 근거 설명에 사용할 프롬프트 초안을 작성해줘.
