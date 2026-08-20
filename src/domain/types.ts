export type UserId = string;
export type DocumentId = string;
export type ExtractedItemId = string;
export type CalendarEventId = string;
export type WeeklyPlanId = string;
export type TodoId = string;
export type OperationId = string;
export type SourceReferenceId = string;

export interface User {
  id: UserId;
  displayName: string;
  calendarConnectionStatus: "disconnected" | "connecting" | "connected" | "failed";
  /** JavaScript weekday: 0 is Sunday. */
  weeklyPlanGenerationDay: number;
  weeklyPlanGenerationTime: `${number}:${number}`;
  planGenerationRequest: string;
}

export type DocumentType =
  | "syllabus"
  | "assignment-brief"
  | "lms-notice"
  | "exam-notice"
  | "email-notice"
  | "timetable"
  | "other";
export type UploadStatus = "uploading" | "complete" | "failed";
export type ExtractionStatus = "extracting" | "complete" | "needs-review" | "failed";

export interface UploadedDocument {
  id: DocumentId;
  userId: UserId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentType: DocumentType;
  supportedFileFormat: "pdf" | "image";
  uploadStatus: UploadStatus;
  extractionStatus: ExtractionStatus;
  uploadedAt: string;
}

export type ExtractedItemType =
  | "assignment"
  | "exam"
  | "team-project"
  | "presentation"
  | "quiz"
  | "class-schedule"
  | "other";
export type Difficulty = "high" | "medium" | "low" | "unknown";
export type AcademicEventConfirmationStatus = "confirmed" | "unconfirmed";
export type AcademicEventDateCertainty = "exact-date" | "academic-week" | "unknown";
export type AcademicEventUpdateNoticeStatus = "unread" | "reviewed";
export type AcademicEventConfirmationIssue =
  | "missing-title"
  | "missing-course"
  | "missing-date"
  | "missing-details"
  | "missing-exam-scope"
  | "missing-class-time";

export type ClassWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 0;

export interface ClassMeetingTime {
  id: string;
  /** JavaScript weekday: 0 is Sunday, 1 is Monday. */
  weekday: ClassWeekday;
  startTime: string;
  endTime: string;
  location: string | null;
}

export interface SourceReference {
  id: SourceReferenceId;
  documentId: DocumentId;
  fileName: string;
  documentType: DocumentType;
  evidence: string | null;
}

export interface ExtractedItem {
  id: ExtractedItemId;
  /** Kept for the existing plan/calendar adapters; the full provenance is in sourceReferences. */
  documentId: DocumentId;
  sourceDocumentIds: DocumentId[];
  sourceReferences: SourceReference[];
  title: string;
  itemType: ExtractedItemType;
  courseName: string;
  courseCode: string | null;
  date: string | null;
  time: string | null;
  /** True only when the source or user explicitly says the event occupies the whole day. */
  isAllDay?: boolean;
  /** Calendar precision is independent from whether the event is plan-ready. */
  dateCertainty: AcademicEventDateCertainty;
  /** Source-stated academic week, kept separately from an exact calendar date. */
  scheduledWeek: number | null;
  /** Original source expression such as `8주차` or `Week 8`. */
  scheduledWeekLabel: string | null;
  /** Source-backed first day of academic week 1. Never inferred from the week number alone. */
  weekOneStartDate: string | null;
  /** Repeating weekly class meetings extracted from timetable materials. */
  classMeetingTimes: ClassMeetingTime[];
  assignmentType: "problem-set" | "coding" | "report" | "essay" | "presentation" | "team-project" | "other" | null;
  examType: string | null;
  workload: string | null;
  requirements: string | null;
  researchNeeded: "none" | "low" | "medium" | "high" | "unknown";
  deliverableComplexity: string | null;
  examScope: string | null;
  gradingMethod: string | null;
  submissionMethod: string | null;
  requiredMaterials: string | null;
  difficulty: Difficulty;
  estimatedDurationMinutes: number | null;
  confidence: number;
  uncertaintyNotes: string[];
  /** Whether the event has enough source-backed core information to be used as a final event. */
  confirmationStatus: AcademicEventConfirmationStatus;
  confirmationIssues: AcademicEventConfirmationIssue[];
  /** Monotonic source-backed revision used by plan snapshots and update notices. */
  revision: number;
  updateNoticeStatus: AcademicEventUpdateNoticeStatus;
  updatedAt: string;
  /** Human review state, separate from information completeness. */
  reviewStatus: "confirmed" | "needs-review";
  isUserEdited: boolean;
}

export interface CalendarEvent {
  id: CalendarEventId;
  userId: UserId;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  eventType: "personal" | "class";
  source: "google-calendar" | "catchup";
  updatedAt: string;
}

export interface WeeklyPlan {
  id: WeeklyPlanId;
  userId: UserId;
  weekStartDate: string;
  weekEndDate: string;
  status: "complete";
  createdAt: string;
  generationRequest: string;
  referenceWindowEndDate: string;
  summary: string;
  interpretationSummary?: string;
  interpretedConstraints?: InterpretedPlanConstraints;
  /** Academic-event versions reflected by the latest generation/update. */
  academicEventSnapshot?: Record<ExtractedItemId, string>;
  lastAdjustedAt?: string;
}

export type PlanningConfidence = "low" | "medium" | "high";
export type PlanningPace = "slow" | "average" | "fast";
export type PreparationLevel = "ready" | "review-needed" | "restart-needed";
export type ExamGoal = "pass" | "c" | "b" | "a";

export interface PlanningProfile {
  /** User-supplied fallback when uploaded materials do not map academic weeks to dates. */
  semesterWeekOneStartDate: string | null;
  confidenceByCourse: Record<string, PlanningConfidence>;
  pace: PlanningPace | null;
  preparationByEventId: Record<ExtractedItemId, PreparationLevel>;
  examGoalByEventId: Record<ExtractedItemId, ExamGoal>;
  /** Upper bound for WeeklyPlanTask time. Scheduled events are not included in this number. */
  maxDailyStudyMinutes?: number | null;
}

export interface Todo {
  id: TodoId;
  weeklyPlanId: WeeklyPlanId;
  sourceExtractedItemId: ExtractedItemId;
  scheduledDate: string;
  /** Optional AI-proposed study start. Used for deterministic schedule-overlap validation. */
  startTime?: string | null;
  title: string;
  todoType: "assignment-work" | "exam-study" | "class-prep" | "review";
  courseName: string;
  estimatedDurationMinutes: number;
  priority: "high" | "medium" | "low";
  isCompleted: boolean;
  recommendationReason: string;
  /** Source-backed and personalized inputs used for this estimate. */
  durationRationale: string[];
  carriedOverFromTodoId: TodoId | null;
  /** Optional deterministic scheduling phase for tasks that form one event workflow. */
  taskPhase?: "prepare" | "research" | "draft" | "work" | "review" | "finalize";
  /** A predecessor in the same AcademicEvent workflow. */
  dependsOnTodoId?: TodoId | null;
  recommendationDetails?: RecommendationReason;
  /** User-added calendar task that is displayed but excluded from AI planning and adjustment. */
  planningParticipation?: "managed" | "calendar-only";
}

export interface InterpretedPlanConstraints {
  maxDailyMinutes: number | null;
  maxTasksByWeekday: Array<{ weekday: number; maxTasks: number }>;
  prohibitedWeekdays: number[];
  lightStudyWeekdays: number[];
  preferredStudyWeekdaysByEventId: Array<{ sourceAcademicEventId: ExtractedItemId; weekdays: number[] }>;
  blockedTimeRanges: Array<{ weekday: number; startTime: string; endTime: string }>;
}

export interface RecommendationReason {
  relatedAcademicEventId: ExtractedItemId;
  needReasons: string[];
  placementReasons: string[];
  priorityReasons: string[];
  durationReasons: string[];
  personalizationReasons: string[];
  userRequestReasons: string[];
  carriedOver: boolean;
  provisionalExamStudy: boolean;
}

export type PlanAdjustmentTrigger = "USER_REQUEST" | "NEW_ACADEMIC_INFORMATION";

export interface PlanAdjustment {
  id: string;
  weeklyPlanId: WeeklyPlanId;
  trigger: PlanAdjustmentTrigger;
  requestText: string | null;
  relatedAcademicEventIds: ExtractedItemId[];
  changedTodoIds: TodoId[];
  createdAt: string;
  /** Rollback snapshots are kept only for automatic plan updates. */
  beforeTodos?: Todo[];
  afterTodos?: Todo[];
  summary?: string;
  diff?: PlanDiff;
  noticeStatus?: "unread" | "reviewed";
  undoneAt?: string;
}

export type PlanUpdateReasonKind = "new-academic-event" | "exam-updated" | "assignment-updated" | "schedule-updated";

export interface PlanUpdateRecommendation {
  id: string;
  reasonKind: PlanUpdateReasonKind;
  academicEventIds: ExtractedItemId[];
  message: string;
  detectedAt: string;
  status: "pending" | "processed";
  processedAt?: string;
  outcome?: "changed" | "no-change" | "dismissed";
  noticeStatus?: "unread" | "reviewed";
  deferredUntilDate?: string;
  /** Snapshot used to explain what changed; Calendar always renders the latest AcademicEvent. */
  previousAcademicEvents?: ExtractedItem[];
}

export type AiMateIntent = "generate-plan" | "adjust-plan" | "update-plan" | "undo-update" | "explain" | "help" | "unknown";
export type AiMateMessageStatus = "sent" | "pending" | "failed";

export interface AiMateMessageAction {
  label: string;
  href?: string;
  action?: "retry";
}

export interface AiMateMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  status: AiMateMessageStatus;
  intent?: AiMateIntent;
  operationId?: OperationId;
  actions?: AiMateMessageAction[];
}

export interface PlanWeekWindow {
  weekStartDate: string;
  weekEndDate: string;
  referenceWindowEndDate: string;
}

export type PlanPrerequisiteReason =
  | "not-scheduled"
  | "no-upload"
  | "calendar-disconnected"
  | "needs-review"
  | "already-generated";

export type PlanPrerequisiteResult =
  | { ok: true }
  | { ok: false; reason: PlanPrerequisiteReason };

export interface GeneratePlanCommand {
  operationId: OperationId;
  requestedAt: string;
  requestText: string;
  user: User;
  documents: UploadedDocument[];
  extractedItems: ExtractedItem[];
  calendarEvents: CalendarEvent[];
  existingWeeklyPlan: WeeklyPlan | null;
  existingIncompleteTodos: Todo[];
  planningProfile: PlanningProfile;
}

export interface GeneratePlanResult {
  operationId: OperationId;
  weeklyPlan: WeeklyPlan;
  todos: Todo[];
  assistantMessage: AiMateMessage;
  validationError?: string;
}

export interface PlanDiff {
  triggeringChange: string;
  addedTaskIds: TodoId[];
  removedTaskIds: TodoId[];
  changedTaskIds: TodoId[];
  movedTasks: Array<{ taskId: TodoId; from: string; to: string }>;
  durationChanges: Array<{ taskId: TodoId; beforeMinutes: number; afterMinutes: number }>;
  reasons: string[];
}

export interface AdjustmentResult {
  operationId: OperationId;
  todos: Todo[];
  changed: boolean;
  assistantMessage: AiMateMessage;
  changedTodoIds?: TodoId[];
  planDiff?: PlanDiff;
}

export interface ExtractionResult {
  operationId: OperationId;
  documents: UploadedDocument[];
  extractedItems: ExtractedItem[];
}
