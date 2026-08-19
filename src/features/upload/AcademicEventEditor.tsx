import type { ClassMeetingTime, ExtractedItem } from "../../domain/types";
import { academicEventConfirmationRequiredInfoLabels } from "../../domain/academicEventStatus";

export const eventTypeLabels: Record<ExtractedItem["itemType"], string> = { assignment: "과제", exam: "시험", "team-project": "팀 프로젝트", presentation: "발표", quiz: "퀴즈", "class-schedule": "수업 일정", other: "기타" };
const assignmentTypeLabels = { "problem-set": "문제풀이", coding: "코딩", report: "보고서", essay: "에세이", presentation: "발표", "team-project": "팀 프로젝트", other: "기타" };
export const weekdayOptions: Array<{ value: ClassMeetingTime["weekday"]; label: string }> = [
  { value: 1, label: "월요일" }, { value: 2, label: "화요일" }, { value: 3, label: "수요일" }, { value: 4, label: "목요일" }, { value: 5, label: "금요일" }, { value: 6, label: "토요일" }, { value: 0, label: "일요일" },
];
// Preserve trailing spaces while the controlled field is being edited. Trimming
// here makes it impossible to enter an internal space one keystroke at a time.
const nullable = (value: string) => value === "" ? null : value;
function displayFileName(fileName: string) { try { return decodeURIComponent(fileName); } catch { return fileName; } }
function scheduledWeekValue(item: ExtractedItem) {
  return item.scheduledWeekLabel ?? (item.scheduledWeek ? `${item.scheduledWeek}주차` : "");
}
function scheduledWeekPatch(value: string): Pick<ExtractedItem, "scheduledWeek" | "scheduledWeekLabel"> {
  const match = value.match(/\d+/);
  return {
    scheduledWeek: match ? Number(match[0]) : null,
    scheduledWeekLabel: nullable(value),
  };
}

interface Props {
  item: ExtractedItem;
  onChange: (patch: Partial<ExtractedItem>) => void;
  errors?: Record<string, string>;
  onDelete?: () => void;
  onSplit?: () => void;
  showSources?: boolean;
}

export function AcademicEventEditor({ item, onChange, errors = {}, onDelete, onSplit, showSources = true }: Props) {
  const updateMeeting = (meetingId: string, patch: Partial<ClassMeetingTime>) => onChange({ classMeetingTimes: item.classMeetingTimes.map((meeting) => meeting.id === meetingId ? { ...meeting, ...patch } : meeting) });
  return <div className="extraction-item__fields academic-event-editor">
    {item.uncertaintyNotes.length > 0 && <aside className="uncertainty-box"><strong>AI 확인 메모</strong>{item.uncertaintyNotes.map((note) => <p key={note}>{note}</p>)}</aside>}
    {item.confirmationIssues.length > 0 && <aside className="confirmation-box"><strong>확정하려면 필요한 정보</strong><p>{academicEventConfirmationRequiredInfoLabels[item.itemType]}</p></aside>}
    <div className="field-row"><label>이벤트명<input aria-label="이벤트명" value={item.title} onChange={(event) => onChange({ title: event.target.value })} />{errors[`${item.id}-title`] && <span className="field-error">{errors[`${item.id}-title`]}</span>}</label><label>과목<input aria-label="과목" value={item.courseName} onChange={(event) => onChange({ courseName: event.target.value })} />{errors[`${item.id}-course`] && <span className="field-error">{errors[`${item.id}-course`]}</span>}</label></div>
    <label>이벤트 유형<select aria-label="이벤트 유형" value={item.itemType} onChange={(event) => onChange({ itemType: event.target.value as ExtractedItem["itemType"] })}>{Object.entries(eventTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {item.itemType !== "class-schedule" && <><div className="field-row"><label>날짜 / 마감일<input aria-label="날짜 / 마감일" type="date" value={item.date ?? ""} onChange={(event) => onChange({ date: nullable(event.target.value) })} />{errors[`${item.id}-date`] && <span className="field-error">{errors[`${item.id}-date`]}</span>}</label><label>시간<input aria-label="시간" type="time" disabled={item.isAllDay === true} value={item.time ?? ""} onChange={(event) => onChange({ time: nullable(event.target.value), isAllDay: false })} /></label></div><label className="all-day-toggle"><span>종일</span><input aria-label="종일 일정" type="checkbox" checked={item.isAllDay === true} onChange={(event) => onChange({ isAllDay: event.target.checked, time: event.target.checked ? null : item.time })} /></label></>}
    {item.itemType !== "class-schedule" && <label>예정 주차<input aria-label="예정 주차" value={scheduledWeekValue(item)} onChange={(event) => onChange(scheduledWeekPatch(event.target.value))} placeholder="예: 8주차, Week 8" /></label>}
    {item.itemType === "class-schedule" && <section className="class-meeting-editor"><div className="class-meeting-editor__heading"><h3>수업 시간</h3><button type="button" onClick={() => onChange({ classMeetingTimes: [...item.classMeetingTimes, { id: `meeting-${item.id}-${Date.now()}`, weekday: 1, startTime: "09:00", endTime: "10:00", location: null }] })}>수업 시간 추가</button></div>{item.classMeetingTimes.map((meeting, index) => <article className="class-meeting-row" key={meeting.id}><div className="field-row"><label>요일<select aria-label={`수업 ${index + 1} 요일`} value={meeting.weekday} onChange={(event) => updateMeeting(meeting.id, { weekday: Number(event.target.value) as ClassMeetingTime["weekday"] })}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>강의실<input aria-label={`수업 ${index + 1} 강의실`} value={meeting.location ?? ""} onChange={(event) => updateMeeting(meeting.id, { location: nullable(event.target.value) })} placeholder="정보 없음" /></label></div><div className="field-row"><label>시작 시간<input aria-label={`수업 ${index + 1} 시작 시간`} type="time" value={meeting.startTime} onChange={(event) => updateMeeting(meeting.id, { startTime: event.target.value })} /></label><label>종료 시간<input aria-label={`수업 ${index + 1} 종료 시간`} type="time" value={meeting.endTime} onChange={(event) => updateMeeting(meeting.id, { endTime: event.target.value })} /></label></div><button type="button" className="class-meeting-remove" onClick={() => onChange({ classMeetingTimes: item.classMeetingTimes.filter((candidate) => candidate.id !== meeting.id) })}>이 수업 시간 삭제</button></article>)}</section>}
    {(item.itemType === "assignment" || item.itemType === "team-project" || item.itemType === "presentation") && <label>과제 유형<select value={item.assignmentType ?? ""} onChange={(event) => onChange({ assignmentType: (event.target.value || null) as ExtractedItem["assignmentType"] })}><option value="">정보 없음</option>{Object.entries(assignmentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    {(item.itemType === "exam" || item.itemType === "quiz") && <><label>시험 유형<input aria-label="시험 유형" value={item.examType ?? ""} onChange={(event) => onChange({ examType: nullable(event.target.value) })} placeholder="예: 중간고사, 오픈북" /></label><label>시험 범위<textarea aria-label="시험 범위" value={item.examScope ?? ""} onChange={(event) => onChange({ examScope: nullable(event.target.value) })} /></label><label>평가 방식<input aria-label="평가 방식" value={item.gradingMethod ?? ""} onChange={(event) => onChange({ gradingMethod: nullable(event.target.value) })} placeholder="예: 점수제" /></label></>}
    {item.itemType !== "class-schedule" && <><label>분량<input aria-label="분량" value={item.workload ?? ""} onChange={(event) => onChange({ workload: nullable(event.target.value) })} placeholder="정보 없음" /></label><label>요구사항<textarea aria-label="요구사항" value={item.requirements ?? ""} onChange={(event) => onChange({ requirements: nullable(event.target.value) })} placeholder="정보 없음" /></label><label>객관적 난이도<select value={item.difficulty} onChange={(event) => onChange({ difficulty: event.target.value as ExtractedItem["difficulty"] })}><option value="unknown">확인 필요</option><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option></select></label></>}
    {showSources && <section className="source-reference-list"><h3>통합에 사용된 원본 자료</h3>{item.sourceReferences.map((source) => <article key={source.id}><strong title={displayFileName(source.fileName)}>{displayFileName(source.fileName)}</strong><span>{source.evidence ?? "구체적 근거 위치 확인 필요"}</span></article>)}</section>}
    {onSplit && item.sourceReferences.length > 1 && <button type="button" className="extraction-item-split" onClick={onSplit}>원본 자료 기준으로 이벤트 분리</button>}
    {onDelete && <button type="button" className="extraction-item-delete" onClick={onDelete}>이 학업 이벤트 삭제</button>}
  </div>;
}
