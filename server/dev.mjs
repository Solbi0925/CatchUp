import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const developmentProcesses = [
  // Vite already reloads frontend changes. Keep the Local Bridge in sync too,
  // otherwise a newly added API route can hit an older long-running process.
  { name: "bridge", command: process.execPath, args: ["--env-file-if-exists=.env", "--watch", "server/index.mjs"] },
  { name: "frontend", command: process.execPath, args: ["node_modules/vite/bin/vite.js"] },
];

export function runDevelopmentProcesses(spawnProcess = spawn) {
  let shuttingDown = false;
  const children = developmentProcesses.map((processConfig) => ({
    ...processConfig,
    child: spawnProcess(processConfig.command, processConfig.args, { stdio: "inherit" }),
  }));

  const stopAll = (signal = "SIGTERM") => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const { child } of children) {
      if (!child.killed) child.kill(signal);
    }
  };

  process.once("SIGINT", () => stopAll("SIGINT"));
  process.once("SIGTERM", () => stopAll("SIGTERM"));
  for (const { name, child } of children) {
    child.once("exit", (code, signal) => {
      if (shuttingDown) return;
      console.error(`${name} 개발 프로세스가 종료되었습니다${signal ? ` (${signal})` : ` (code ${code ?? 1})`}.`);
      process.exitCode = code ?? 1;
      stopAll();
    });
  }
  return children;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) runDevelopmentProcesses();
