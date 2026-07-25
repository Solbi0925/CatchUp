# TODOS

## Month

### 바텀시트 swipe-down 닫기

**What:** Month 일정 상세 바텀시트에 내부 스크롤과 충돌하지 않는 swipe-down 닫기 gesture를 추가한다.

**Why:** 닫기 버튼, Escape, backdrop, browser back 외에 모바일 사용자에게 익숙한 직접 조작 방식을 제공해 상호작용 완성도를 높인다.

**Context:** Month MVP는 native dialog의 안정적인 포커스·키보드·safe-area 동작을 우선해 swipe-down을 제외한다. 후속 구현 시 drag handle에서 시작한 pointer gesture만 추적하고, 내부 목록이 최상단일 때의 scroll 충돌, 이동 거리·속도 임계값, 취소 애니메이션, dirty 폼 이탈 확인, 키보드·스크린리더 대체 닫기 동작을 함께 설계한다. 장점은 목업에 가까운 모바일 UX이고, 단점은 브라우저별 gesture QA와 상태 전이 유지보수 비용이다.

**Effort:** M
**Priority:** P3
**Depends on:** Month native dialog, 내부 스크롤, dirty 이탈 상태 머신 구현 완료

## Completed
