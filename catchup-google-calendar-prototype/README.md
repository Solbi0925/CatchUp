# CatchUp Google Calendar Prototype

Vite 기반 Google Calendar 읽기 연동 MVP 프로토타입입니다.

## 기능

- Google Calendar 읽기 전용 권한 요청
- 기본 캘린더(`primary`)의 앞으로 4주 일정 조회
- 일정 수, 다음 일정, 일정 목록 표시
- 연결 해제 시 access token revoke
- OAuth Client ID를 화면에 노출하지 않고 `.env`에서 관리

## 설정

`.env.example`을 참고해 `.env` 파일을 만들고 Google OAuth Client ID를 넣습니다.

```env
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

이전에 정적 프로토타입 화면에서 Client ID를 저장했다면 브라우저 localStorage의 기존 값도 fallback으로 사용합니다. 실제 앱 구조에서는 `.env` 값만 사용하는 방향으로 정리하면 됩니다.

## Google Cloud 설정

1. Google Cloud Console에서 프로젝트를 만듭니다.
2. Google Calendar API를 사용 설정합니다.
3. Google Auth Platform에서 OAuth 동의 화면을 설정합니다.
4. OAuth Client를 `Web application` 유형으로 만듭니다.
5. Authorized JavaScript origins에 로컬 실행 주소를 추가합니다.
   - `http://localhost:5173`
6. 테스트 모드라면 테스트 사용자에 본인 Gmail 계정을 추가합니다.

## 실행

의존성을 설치합니다.

```powershell
pnpm install
```

개발 서버를 실행합니다.

```powershell
pnpm run dev
```

현재 PC처럼 `node` 명령이 PATH에 없으면 아래 스크립트를 실행합니다.

```powershell
.\start-vite.ps1
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:5173
```

## MVP 범위

현재 구현은 Google Calendar 일정 불러오기만 포함합니다. 일정 추가, 수정, 삭제, 실시간 자동 동기화, 백그라운드 변경 감지는 MVP 범위에서 제외합니다.
