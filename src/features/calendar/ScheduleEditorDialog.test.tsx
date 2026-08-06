import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";

const draft = {
  title: "데이터베이스 시험",
  date: "2026-07-22",
  startTime: "09:00",
  endTime: "10:00",
  isAllDay: false,
  eventType: "class" as const,
};

afterEach(cleanup);

describe("ScheduleEditorDialog", () => {
  it("offers only six category colors with a course-wide explanation", () => {
    render(
      <MemoryRouter>
        <ScheduleEditorDialog
          initialDraft={draft}
          categoryKind="course"
          categoryColor="#C7B9FA"
          readOnly={false}
          onSave={vi.fn()}
          onColorChange={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("radio", { name: /색상/ })).toHaveLength(6);
    expect(screen.getByText("같은 과목의 모든 일정에 적용돼요.")).toBeInTheDocument();
  });

  it("validates editable schedules and keeps upload details read-only", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <ScheduleEditorDialog
          initialDraft={draft}
          categoryKind="personal"
          categoryColor="#D9F0FF"
          readOnly={false}
          onSave={vi.fn()}
          onColorChange={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    await user.clear(screen.getByRole("textbox", { name: "제목" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent("일정 제목");

    rerender(
      <MemoryRouter>
        <ScheduleEditorDialog
          initialDraft={draft}
          categoryKind="course"
          categoryColor="#C7B9FA"
          readOnly
          onSave={vi.fn()}
          onColorChange={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("textbox", { name: "제목" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Upload에서 수정" })).toHaveAttribute("href", "/upload");
  });
});
