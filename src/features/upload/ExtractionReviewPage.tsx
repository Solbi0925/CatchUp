import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { selectExtractedItemsForDocument } from "../../domain/selectors";
import type { ExtractedItem } from "../../domain/types";
import { usePrototypeStore } from "../../store/PrototypeStore";

export function ExtractionReviewPage() {
  const { documentId = "" } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = usePrototypeStore();
  const document = state.documentsById[documentId];
  const items = selectExtractedItemsForDocument(state, documentId);
  const [draft, setDraft] = useState<ExtractedItem[]>(() => items.map((item) => ({ ...item })));
  const [expandedId, setExpandedId] = useState<string | undefined>(
    () => items.find((item) => item.reviewStatus === "needs-review")?.id ?? items[0]?.id,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstErrorRef = useRef<HTMLInputElement>(null);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(items), [draft, items]);

  if (!document) {
    return (
      <main className="focus-page">
        <h1>자료를 찾지 못했어요</h1>
        <button type="button" className="primary-button" onClick={() => navigate("/upload")}>
          Upload로 돌아가기
        </button>
      </main>
    );
  }

  function updateItem(id: string, field: keyof ExtractedItem, value: string | number) {
    setDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function save() {
    const nextErrors: Record<string, string> = {};
    draft.forEach((item) => {
      if (!item.title.trim()) nextErrors[`${item.id}-title`] = "과제명을 입력해주세요.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        nextErrors[`${item.id}-date`] = "올바른 날짜를 입력해주세요.";
      }
      if (item.estimatedDurationMinutes <= 0) {
        nextErrors[`${item.id}-duration`] = "예상 소요 시간을 입력해주세요.";
      }
    });
    setErrors(nextErrors);
    const firstErrorKey = Object.keys(nextErrors)[0];
    if (firstErrorKey) {
      setExpandedId(firstErrorKey.split("-").slice(0, -1).join("-"));
      window.setTimeout(() => firstErrorRef.current?.focus(), 0);
      return;
    }
    dispatch({
      type: "extraction/confirmed",
      payload: {
        documentId,
        items: draft.map((item, index) => ({
          ...item,
          reviewStatus: "confirmed",
          isUserEdited: item.isUserEdited || JSON.stringify(item) !== JSON.stringify(items[index]),
        })),
      },
    });
    navigate("/upload", { state: { showAiMateCoachmark: true } });
  }

  function goBack() {
    if (!isDirty || window.confirm("저장하지 않은 변경사항이 있어요. 나갈까요?")) navigate("/upload");
  }

  return (
    <main className="focus-page extraction-review-page">
      <header className="focus-header">
        <button type="button" className="back-button" aria-label="Upload로 돌아가기" onClick={goBack}>
          ‹
        </button>
        <div>
          <h1>추출 결과 확인 및 수정</h1>
          <p>{document.fileName}</p>
        </div>
      </header>
      <p className="review-summary">
        확인이 필요한 항목 {draft.filter((item) => item.reviewStatus === "needs-review").length}개
      </p>
      <div className="extraction-list">
        {draft.map((item, itemIndex) => {
          const expanded = expandedId === item.id;
          const hasError = Object.keys(errors).some((key) => key.startsWith(item.id));
          return (
            <section className="extraction-item" key={item.id}>
              <button
                type="button"
                className="extraction-item__toggle"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? undefined : item.id)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.courseName} · {item.date}</small>
                </span>
                <span className={hasError ? "status-badge status-badge--error" : "status-badge"}>
                  {hasError ? "입력 확인" : item.reviewStatus === "needs-review" ? "확인 필요" : "확인 완료"}
                </span>
              </button>
              {expanded && (
                <div className="extraction-item__fields">
                  <label>
                    과제명
                    <input
                      ref={itemIndex === 0 ? firstErrorRef : undefined}
                      value={item.title}
                      onChange={(event) => updateItem(item.id, "title", event.target.value)}
                    />
                    {errors[`${item.id}-title`] && <span className="field-error">{errors[`${item.id}-title`]}</span>}
                  </label>
                  <div className="field-row">
                    <label>
                      날짜
                      <input type="date" value={item.date} onChange={(event) => updateItem(item.id, "date", event.target.value)} />
                    </label>
                    <label>
                      시간
                      <input type="time" value={item.time ?? ""} onChange={(event) => updateItem(item.id, "time", event.target.value)} />
                    </label>
                  </div>
                  <label>
                    과목명
                    <input value={item.courseName} onChange={(event) => updateItem(item.id, "courseName", event.target.value)} />
                  </label>
                  <label>
                    예상 소요 시간(분)
                    <input type="number" min="1" value={item.estimatedDurationMinutes} onChange={(event) => updateItem(item.id, "estimatedDurationMinutes", Number(event.target.value))} />
                  </label>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="focus-actions">
        <button type="button" className="primary-button" onClick={save}>
          변경사항 저장
        </button>
      </div>
    </main>
  );
}
