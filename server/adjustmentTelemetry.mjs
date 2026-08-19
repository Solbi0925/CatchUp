const allowedKeys = new Set(["operationId", "mode", "attempt", "stage", "receivedAt", "promptChars", "promptBytes", "inputChars", "inputBytes", "elapsedMs", "codexMs", "jsonParseMs", "executionMs", "validationMs", "totalMs", "retry", "fastPath", "result", "status", "modelConfigured"]);

export function safeAdjustmentLog(meta) {
  return Object.fromEntries(Object.entries(meta).filter(([key, value]) => allowedKeys.has(key) && ["string", "number", "boolean"].includes(typeof value)));
}

export function logAdjustmentPerformance(meta, sink = console.info) {
  sink("[catchup:adjust]", safeAdjustmentLog(meta));
}
