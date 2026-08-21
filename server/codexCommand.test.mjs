import { describe, expect, it } from "vitest";
import { resolveCodexCommand } from "./codexCommand.mjs";

describe("Codex command resolution", () => {
  it("uses the project-local Codex CLI entrypoint when it exists", () => {
    const command = resolveCodexCommand({
      execPath: "C:\\node\\node.exe",
      cwd: "C:\\project",
      existsSync: (path) => path === "C:\\project\\node_modules\\@openai\\codex\\bin\\codex.js",
    });

    expect(command).toEqual({
      command: "C:\\node\\node.exe",
      prefixArgs: ["C:\\project\\node_modules\\@openai\\codex\\bin\\codex.js"],
    });
  });

  it("falls back to the codex command when the local package is absent", () => {
    const command = resolveCodexCommand({
      execPath: "C:\\node\\node.exe",
      cwd: "C:\\project",
      existsSync: () => false,
    });

    expect(command).toEqual({ command: "codex", prefixArgs: [] });
  });
});
