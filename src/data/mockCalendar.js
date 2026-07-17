export const MOCK_EVENTS = [
  {
    id: 'event-1',
    title: '자료구조 중간고사',
    date: '2026-07-15',
    start: '10:00',
    end: '12:00',
    calendar: '자료구조',
    color: '#F08A5D',
    type: 'exam',
    location: '공학관 302호',
  },
  {
    id: 'event-2',
    title: '점심 약속',
    date: '2026-07-15',
    start: '13:00',
    end: '14:00',
    calendar: '개인 일정',
    color: '#5C8D89',
    type: 'personal',
    location: '학생회관',
  },
  {
    id: 'event-3',
    title: 'UX 리서치 과제',
    date: '2026-07-15',
    start: '16:00',
    end: '18:00',
    calendar: 'HCI 디자인',
    color: '#6C63FF',
    type: 'assignment',
    location: '온라인 제출',
  },
  {
    id: 'event-4',
    title: '운영체제 퀴즈',
    date: '2026-07-17',
    start: '11:00',
    end: '11:30',
    calendar: '운영체제',
    color: '#D2A84A',
    type: 'class',
    location: '온라인',
  },
  {
    id: 'event-5',
    title: 'HCI 프로젝트 중간 발표',
    date: '2026-07-21',
    start: '15:00',
    end: '17:00',
    calendar: 'HCI 디자인',
    color: '#6C63FF',
    type: 'assignment',
    location: '창의관 201호',
  },
  {
    id: 'event-6',
    title: '데이터베이스 기말 프로젝트',
    date: '2026-07-29',
    start: '23:59',
    end: '23:59',
    calendar: '데이터베이스',
    color: '#E05C7A',
    type: 'assignment',
    location: 'LMS 제출',
  },
  {
    id: 'event-7',
    title: '운영체제 기말고사',
    date: '2026-08-04',
    start: '14:00',
    end: '16:00',
    calendar: '운영체제',
    color: '#D2A84A',
    type: 'exam',
    location: '공학관 105호',
  },
];

export const TODAY = '2026-07-15';

export const MOCK_PLAN_ITEMS = [
  { id: 'plan-1', date: '2026-07-15', title: '자료구조 시험 범위 마지막 점검', source: '자료구조', duration: '45분', priority: '높음', reason: '오늘 예정된 시험과 연결된 데모 계획입니다.' },
  { id: 'plan-2', date: '2026-07-16', title: 'UX 리서치 과제 자료 읽기', source: 'HCI 디자인', duration: '30분', priority: '보통', reason: '다음 주 발표를 준비하기 위한 데모 계획입니다.' },
  { id: 'plan-3', date: '2026-07-17', title: '운영체제 퀴즈 오답 정리', source: '운영체제', duration: '25분', priority: '보통', reason: '이번 주 퀴즈 일정을 기준으로 배치한 데모 계획입니다.' },
  { id: 'plan-4', date: '2026-07-20', title: 'HCI 발표 자료 목차 잡기', source: 'HCI 디자인', duration: '40분', priority: '보통', reason: '발표일 전에 작은 단위로 시작하도록 배치했습니다.' },
];

export function eventsForDate(date, events = MOCK_EVENTS) {
  return events.filter((event) => event.date === date);
}

export function plansForDate(date) {
  return MOCK_PLAN_ITEMS.filter((item) => item.date === date);
}

export function eventsForMonth(year, month, events = MOCK_EVENTS) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  return events.filter((event) => event.date.startsWith(monthKey));
}

export function formatKoreanDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}
