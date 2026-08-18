import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { selectAllExtractedItems } from "../../domain/selectors";
import { usePrototypeStore } from "../../store/PrototypeStore";
import { analyzeAcademicFiles } from "./extractionAdapter";
import { uploadReducer, type UploadUiEvent, type UploadUiState } from "./uploadReducer";

interface UploadSessionValue {
  uiState: UploadUiState;
  dispatch: Dispatch<UploadUiEvent>;
  analyze: () => Promise<void>;
}

const UploadSessionContext = createContext<UploadSessionValue | null>(null);

export function UploadSessionProvider({ children }: { children: ReactNode }) {
  const { state: store, dispatch: storeDispatch } = usePrototypeStore();
  const [uiState, dispatch] = useReducer(uploadReducer, { status: "idle", files: [] });
  const abortRef = useRef<AbortController | null>(null);
  const events = selectAllExtractedItems(store);

  useEffect(() => () => abortRef.current?.abort(), []);

  const analyze = useCallback(async () => {
    const targets = uiState.files.filter((entry) => entry.status === "pending" || entry.status === "failed");
    if (!targets.length || uiState.status === "extracting") return;
    const operationId = `extract-${Date.now()}`;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const fileIds = targets.map((entry) => entry.id);
    dispatch({ type: "extraction/started", operationId, fileIds });
    try {
      const result = await analyzeAcademicFiles({
        files: targets.map((entry) => entry.file),
        operationId,
        existingEvents: events,
        signal: controller.signal,
      });
      const normalized = result.extractedItems.length === 0 ? { ...result, documents: result.documents.map((document) => ({ ...document, extractionStatus: "failed" as const })) } : result;
      storeDispatch({ type: "extraction/applied", payload: normalized });
      dispatch({ type: "extraction/succeeded", result: normalized, fileIds });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({
        type: "extraction/failed",
        fileIds,
        message: error instanceof Error && error.message !== "analysis-failed"
          ? error.message
          : "자료를 통합 분석하지 못했어요. 로컬 브리지 실행 상태를 확인하고 다시 시도해주세요.",
      });
    }
  }, [events, storeDispatch, uiState.files, uiState.status]);

  const value = useMemo(() => ({ uiState, dispatch, analyze }), [analyze, uiState]);
  return <UploadSessionContext.Provider value={value}>{children}</UploadSessionContext.Provider>;
}

export function useUploadSession() {
  const value = useContext(UploadSessionContext);
  if (!value) throw new Error("useUploadSession must be used inside UploadSessionProvider");
  return value;
}
