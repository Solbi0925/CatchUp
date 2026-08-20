import { useEffect, useState } from "react";
import { assessAcademicEventConfirmation } from "../../domain/academicEventStatus";
import type { ExtractedItem } from "../../domain/types";
import { AcademicEventEditor } from "./AcademicEventEditor";
import "./upload.css";

interface Props { item: ExtractedItem; onSave: (item: ExtractedItem) => void; onDelete: () => void; onClose: () => void; }

export function AcademicEventEditorDialog({ item, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(item);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setDraft(item), [item]);
  const update = (patch: Partial<ExtractedItem>) => setDraft((current) => { const next = { ...current, ...patch }; return { ...next, ...assessAcademicEventConfirmation(next) }; });
  const save = () => {
    const nextErrors: Record<string, string> = {};
    if (!draft.title.trim()) nextErrors[`${draft.id}-title`] = "이벤트명을 입력해주세요.";
    if (!draft.courseName.trim()) nextErrors[`${draft.id}-course`] = "과목명을 입력해주세요.";
    setErrors(nextErrors); if (Object.keys(nextErrors).length) return;
    onSave(draft);
  };
  return <div className="academic-editor-dialog" role="dialog" aria-modal="true" aria-label={`${item.title} 학업 이벤트 수정`}>
    <header className="academic-editor-dialog__header"><div><h2>학업 이벤트 확인 및 수정</h2><p>{draft.courseName} · {draft.confirmationStatus === "confirmed" ? "확정" : "미확정"}</p></div><button type="button" onClick={onClose} aria-label="닫기">×</button></header>
    <div className="academic-editor-dialog__body"><AcademicEventEditor item={draft} onChange={update} errors={errors} onDelete={onDelete} /></div>
    <footer className="academic-editor-dialog__actions"><button type="button" className="primary-button" onClick={save}>학업 이벤트 저장</button></footer>
  </div>;
}
