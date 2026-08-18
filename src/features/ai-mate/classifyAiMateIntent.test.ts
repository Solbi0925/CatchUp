import { describe, expect, it } from "vitest";
import { classifyAiMateIntent } from "./classifyAiMateIntent";

describe("classifyAiMateIntent", () => {
  it.each([
    ["이번 주 계획 짜줘", "generate-plan"],
    ["오늘부터 7일 계획을 생성해줘", "generate-plan"],
    ["주간계획 생성해줘. 다음의 요청사항을 반영해: 목요일, 금요일에는 할 일 1개 이하로 줄여줘.", "generate-plan"],
    ["수요일 할 일을 줄여줘", "adjust-plan"],
    ["왜 이 과제를 먼저 해야 해?", "explain"],
    ["무엇을 할 수 있어?", "help"],
    ["안녕", "unknown"],
    ["아냐, 취소해줘", "undo-update"],
  ] as const)("%s → %s", (message, intent) => {
    expect(classifyAiMateIntent(message)).toBe(intent);
  });

  it("treats an explanation about a plan as explanation, not generation", () => {
    expect(classifyAiMateIntent("계획을 왜 이렇게 짰어?")).toBe("explain");
  });
});
