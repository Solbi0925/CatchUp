const BASE_ANALYSIS_TIMEOUT_MS = 5 * 60_000;
const EXTRA_FILE_TIMEOUT_MS = 2 * 60_000;
const MAX_ANALYSIS_TIMEOUT_MS = 20 * 60_000;

export function analysisTimeoutMs(fileCount) {
  const normalizedCount = Math.max(1, Number.isFinite(fileCount) ? Math.floor(fileCount) : 1);
  return Math.min(
    MAX_ANALYSIS_TIMEOUT_MS,
    BASE_ANALYSIS_TIMEOUT_MS + (normalizedCount - 1) * EXTRA_FILE_TIMEOUT_MS,
  );
}
