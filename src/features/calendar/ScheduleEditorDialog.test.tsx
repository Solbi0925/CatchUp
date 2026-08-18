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
          draftIdentity="schedule-1"
          initialDraft={draft}
          categoryKind="course"
          categoryColor="#C7B9FA"
          onSave={vi.fn()}
          onColorChange={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("radio", { name: /색상/ })).toHaveLength(6);
    expect(screen.getByText("같은 과목의 모든 일정에 적용돼요.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "일정 유형" })).not.toBeInTheDocument();
  });

  it("일정 삭제를 원본 삭제 콜백으로 전달한다", async () => {
    const onDelete = vi.fn();
    render(<MemoryRouter><ScheduleEditorDialog draftIdentity="schedule-1" initialDraft={draft} categoryKind="course" categoryColor="#C7B9FA" onSave={vi.fn()} onDelete={onDelete} onColorChange={vi.fn()} onClose={vi.fn()} /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole("button", { name: "일정 삭제" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("validates schedules and lets Upload-derived schedules save in place", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <MemoryRouter>
        <ScheduleEditorDialog
          draftIdentity="schedule-1"
          initialDraft={draft}
          categoryKind="personal"
          categoryColor="#D9F0FF"
          onSave={onSave}
          onColorChange={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    await user.clear(screen.getByRole("textbox", { name: "제목" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent("일정 제목");
    await user.type(screen.getByRole("textbox", { name: "제목" }), "수정된 일정");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "수정된 일정" }));
    expect(screen.queryByText("Upload에서 수정")).not.toBeInTheDocument();
  });

  it("keeps edited values when a color change rerenders the parent", async () => {
    const user = userEvent.setup();
    const props = { draftIdentity: "schedule-1", categoryKind: "personal" as const, onSave: vi.fn(), onColorChange: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<MemoryRouter><ScheduleEditorDialog {...props} initialDraft={{ ...draft }} categoryColor="#C7B9FA" /></MemoryRouter>);
    const title = screen.getByRole("textbox", { name: "제목" });
    await user.clear(title);
    await user.type(title, "편집 중인 발표 일정");
    const date = screen.getByDisplayValue("2026-07-22");
    await user.clear(date);
    await user.type(date, "2026-08-31");
    await user.click(screen.getByRole("radio", { name: "색상 2" }));

    rerender(<MemoryRouter><ScheduleEditorDialog {...props} initialDraft={{ ...draft }} categoryColor="#E9E0FF" /></MemoryRouter>);

    expect(screen.getByRole("textbox", { name: "제목" })).toHaveValue("편집 중인 발표 일정");
    expect(screen.getByDisplayValue("2026-08-31")).toBeInTheDocument();
    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10:00")).toBeInTheDocument();
  });
});
