export type UserId = string;
export type DocumentId = string;
export type ExtractedItemId = string;
export type CalendarEventId = string;
export type WeeklyPlanId = string;
export type TodoId = string;
export type OperationId = string;

export interface User {
  id: UserId;
  displayName: string;
  calendarConnectionStatus: "disconnected" | "connecting" | "connected" | "failed";
  /** JavaScript weekday: 0 is Sunday. */
  weeklyPlanGenerationDay: number;
  weeklyPlanGenerationTime: `${number}:${number}`;
  planGenerationRequest: string;
}

export type DocumentType = "syllabus" | "lms-notice" | "assignment-brief";
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
  | "deadline"
  | "submission"
  | "notice"
  | "class-schedule";
export type Difficulty = "high" | "medium" | "low";

export interface ExtractedItem {
  id: ExtractedItemId;
  documentId: DocumentId;
  title: string;
  itemType: ExtractedItemType;
  courseName: string;
  date: string;
  time: string | null;
  submissionMethod: string | null;
  requiredMaterials: string | null;
  difficulty: Difficulty;
  estimatedDurationMinutes: number;
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
}

export interface Todo {
  id: TodoId;
  weeklyPlanId: WeeklyPlanId;
  sourceExtractedItemId: ExtractedItemId;
  scheduledDate: string;
  title: string;
  todoType: "assignment-work" | "exam-study" | "class-prep" | "review";
  courseName: string;
  estimatedDurationMinutes: number;
  priority: "high" | "medium" | "low";
  isCompleted: boolean;
  recommendationReason: string;
}

export type AiMateIntent = "generate-plan" | "adjust-plan" | "explain" | "help" | "unknown";
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
}

export interface GeneratePlanResult {
  operationId: OperationId;
  weeklyPlan: WeeklyPlan;
  todos: Todo[];
  assistantMessage: AiMateMessage;
}

export interface AdjustmentResult {
  operationId: OperationId;
  todos: Todo[];
  changed: boolean;
  assistantMessage: AiMateMessage;
}

export interface ExtractionResult {
  operationId: OperationId;
  document: UploadedDocument;
  extractedItems: ExtractedItem[];
}
