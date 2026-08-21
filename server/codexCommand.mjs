import { existsSync as defaultExistsSync } from "node:fs";
import { join } from "node:path";

export function resolveCodexCommand({
  execPath = process.execPath,
  cwd = process.cwd(),
  existsSync = defaultExistsSync,
} = {}) {
  const localEntrypoint = join(cwd, "node_modules", "@openai", "codex", "bin", "codex.js");
  if (existsSync(localEntrypoint)) {
    return { command: execPath, prefixArgs: [localEntrypoint] };
  }
  return { command: "codex", prefixArgs: [] };
}
