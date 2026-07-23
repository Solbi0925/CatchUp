export const TODAY = '2026-07-20';

const courseColor = {
  algorithm: '#8B69F7',
  database: '#A98CF6',
  operatingSystem: '#D2A84A',
  statistics: '#67C7A0',
  personal: '#8D889C',
};

export const MOCK_EVENTS = [
  { id: 'calendar-demo-01', title: '팀 프로젝트 회의', date: '2026-07-20', start: '14:00', end: '16:00', calendar: 'Google Calendar', color: courseColor.personal, type: 'personal' },
  { id: 'calendar-demo-02', title: '아르바이트', date: '2026-07-21', start: '18:00', end: '22:00', calendar: 'Google Calendar', color: courseColor.personal, type: 'personal' },
  { id: 'calendar-demo-03', title: '병원 예약', date: '2026-07-22', start: '10:30', end: '11:30', calendar: 'Google Calendar', color: courseColor.personal, type: 'personal' },
  { id: 'calendar-demo-04', title: '동아리 정기 모임', date: '2026-07-22', start: '17:00', end: '19:00', calendar: 'Google Calendar', color: courseColor.personal, type: 'personal' },
  { id: 'calendar-demo-05', title: '가족 식사', date: '2026-07-25', start: '18:00', end: '20:00', calendar: 'Google Calendar', color: courseColor.personal, type: 'personal' },
  { id: 'calendar-demo-06', title: '휴식일', date: '2026-07-26', start: '종일', end: '종일', calendar: 'Google Calendar', color: courseColor.personal, type: 'personal' },
  { id: 'calendar-demo-07', title: '팀 발표 준비 회의', date: '2026-07-30', start: '15:00', end: '17:00', calendar: 'Google Calendar', color: courseColor.personal, type: 'personal' },
  { id: 'extracted-demo-08', title: '표본분포 연습문제 제출', date: '2026-07-21', start: '23:59', end: '23:59', calendar: '통계학', color: courseColor.statistics, type: 'assignment' },
  { id: 'extracted-demo-04', title: 'ERD 실습 준비', date: '2026-07-22', start: '13:00', end: '14:00', calendar: '데이터베이스', color: courseColor.database, type: 'class' },
  { id: 'extracted-demo-02', title: '알고리즘 과제 제출 마감', date: '2026-07-23', start: '23:59', end: '23:59', calendar: '알고리즘', color: courseColor.algorithm, type: 'assignment' },
  { id: 'extracted-demo-05', title: '운영체제 보강 공지', date: '2026-07-24', start: '18:00', end: '18:00', calendar: '운영체제', color: courseColor.operatingSystem, type: 'notice' },
  { id: 'extracted-demo-03', title: '정규화 개념 퀴즈', date: '2026-07-25', start: '10:00', end: '11:00', calendar: '데이터베이스', color: courseColor.database, type: 'exam' },
  { id: 'extracted-demo-06', title: '프로세스 동기화 복습', date: '2026-07-28', start: '종일', end: '종일', calendar: '운영체제', color: courseColor.operatingSystem, type: 'class' },
  { id: 'extracted-demo-07', title: '통계학 미니 리포트', date: '2026-07-29', start: '18:00', end: '18:00', calendar: '통계학', color: courseColor.statistics, type: 'assignment' },
  { id: 'extracted-demo-09', title: '데이터베이스 팀 프로젝트 주제 제출', date: '2026-08-03', start: '23:59', end: '23:59', calendar: '데이터베이스', color: courseColor.database, type: 'assignment' },
];

export const MOCK_PLAN_ITEMS = [
  { id: 'todo-demo-01', date: '2026-07-20', title: '그래프 탐색 과제 요구사항 정리하기', courseName: '알고리즘', duration: '1시간', deadline: '2026-07-23', priority: '높음', completed: false, reason: '마감까지 시간이 짧고 구현 범위가 넓어 첫날에 요구사항을 정리하는 것을 추천합니다.' },
  { id: 'todo-demo-02', date: '2026-07-20', title: '표본분포 연습문제 풀이 초안 만들기', courseName: '통계학', duration: '1시간', deadline: '2026-07-21', priority: '보통', completed: true, reason: '다음 날 제출 마감이라 오늘 풀이 초안을 끝내두면 부담을 줄일 수 있습니다.' },
  { id: 'todo-demo-03', date: '2026-07-21', title: '표본분포 연습문제 최종 제출하기', courseName: '통계학', duration: '30분', deadline: '2026-07-21', priority: '높음', completed: false, reason: '오늘 23:59 제출 마감이므로 제출 확인까지 마치는 것을 추천합니다.' },
  { id: 'todo-demo-04', date: '2026-07-21', title: '그래프 탐색 기본 함수 구현하기', courseName: '알고리즘', duration: '1시간 30분', deadline: '2026-07-23', priority: '높음', completed: false, reason: '저녁 개인 일정 전에 핵심 구현을 나누어 진행하면 마감 전 수정 시간을 확보할 수 있습니다.' },
  { id: 'todo-demo-05', date: '2026-07-22', title: 'ERD 실습 파일 미리 열어보기', courseName: '데이터베이스', duration: '30분', deadline: '2026-07-22', priority: '보통', completed: false, reason: '수요일에는 개인 일정이 많아 짧은 준비 작업만 배치했습니다.' },
  { id: 'todo-demo-06', date: '2026-07-22', title: '정규화 핵심 개념 3개만 복습하기', courseName: '데이터베이스', duration: '40분', deadline: '2026-07-25', priority: '보통', completed: false, reason: '퀴즈 전 기본 개념을 가볍게 확인하는 정도가 적합한 날입니다.' },
  { id: 'todo-demo-07', date: '2026-07-23', title: '그래프 탐색 과제 테스트 케이스 작성하기', courseName: '알고리즘', duration: '1시간', deadline: '2026-07-23', priority: '높음', completed: false, reason: '오늘 과제 마감이므로 제출 전 오류를 줄이는 작업이 필요합니다.' },
  { id: 'todo-demo-08', date: '2026-07-23', title: '알고리즘 과제 제출 확인하기', courseName: '알고리즘', duration: '30분', deadline: '2026-07-23', priority: '높음', completed: false, reason: '같은 날 23:59 마감이라 파일 업로드와 제출 상태 확인을 분리했습니다.' },
  { id: 'todo-demo-09', date: '2026-07-24', title: '운영체제 보강 공지 내용 확인하기', courseName: '운영체제', duration: '30분', deadline: '2026-07-24', priority: '낮음', completed: false, reason: '공지 확인이 필요한 항목이라 짧게 확인 시간을 배치했습니다.' },
  { id: 'todo-demo-10', date: '2026-07-24', title: '정규화 예제 문제 5개 풀기', courseName: '데이터베이스', duration: '1시간 20분', deadline: '2026-07-25', priority: '높음', completed: false, reason: '다음 날 퀴즈가 있어 실제 문제 풀이 시간을 확보했습니다.' },
  { id: 'todo-demo-11', date: '2026-07-25', title: '데이터베이스 퀴즈 전 오답 노트 훑기', courseName: '데이터베이스', duration: '40분', deadline: '2026-07-25', priority: '높음', completed: false, reason: '오전 퀴즈 직전에 짧게 복습하도록 배치했습니다.' },
  { id: 'todo-demo-12', date: '2026-07-25', title: '통계학 미니 리포트 자료 모으기', courseName: '통계학', duration: '1시간', deadline: '2026-07-29', priority: '보통', completed: false, reason: '다음 주 마감 과제라 주말에 자료 수집만 가볍게 시작하도록 추천합니다.' },
  { id: 'todo-demo-13', date: '2026-07-26', title: '통계학 리포트 분석 방향 메모하기', courseName: '통계학', duration: '40분', deadline: '2026-07-29', priority: '낮음', completed: false, reason: '일요일은 휴식 요청이 있어 부담이 적은 메모 작업만 배치했습니다.' },
  { id: 'todo-demo-14', date: '2026-07-26', title: '운영체제 복습 자료 목록만 정리하기', courseName: '운영체제', duration: '30분', deadline: '2026-07-28', priority: '낮음', completed: false, reason: '다음 주 복습을 준비하되 휴식 시간을 해치지 않도록 짧게 배치했습니다.' },
];

export function eventsForDate(date, events = MOCK_EVENTS) {
  return events.filter((event) => event.date === date);
}

export function plansForDate(date, items = MOCK_PLAN_ITEMS) {
  return items.filter((item) => item.date === date);
}

export function eventsForMonth(year, month, events = MOCK_EVENTS) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  return events.filter((event) => event.date.startsWith(monthKey));
}

export function formatKoreanDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);
}
