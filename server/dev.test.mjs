import { describe, expect, it, vi } from "vitest";
import { developmentProcesses, runDevelopmentProcesses } from "./dev.mjs";

describe("development server launcher", () => {
  it("starts both the analysis bridge and Vite frontend", () => {
    const children = [];
    const spawnProcess = vi.fn((command, args) => {
      const child = { killed: false, kill: vi.fn(), once: vi.fn() };
      children.push(child);
      return child;
    });

    runDevelopmentProcesses(spawnProcess);

    expect(developmentProcesses.map(({ name }) => name)).toEqual(["bridge", "frontend"]);
    expect(spawnProcess).toHaveBeenCalledWith(process.execPath, ["--watch", "server/index.mjs"], { stdio: "inherit" });
    expect(spawnProcess).toHaveBeenCalledWith(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit" });
  });
});
