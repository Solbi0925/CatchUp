import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryRouter,
  RouterProvider,
  type InitialEntry,
} from "react-router-dom";
import { AiMateProvider } from "../ai-mate/AiMateProvider";
import { AppShell } from "../../app/AppShell";
import type { ExtractedItem } from "../../domain/types";
import {
  PrototypeStoreProvider,
  usePrototypeStore,
} from "../../store/PrototypeStore";
import { MonthPage } from "./MonthPage";
import type { CalendarEventMutationAdapter } from "./mockCalendarEventMutation";

function connectDemoCalendar() {
  sessionStorage.setItem(
    "catchup:prototype:onboarding:v1",
    JSON.stringify({
      version: 1,
      introSeen: true,
      calendarStep: "connected",
      calendarConnected: true,
    }),
  );
}

function renderMonth(
  initialEntries: InitialEntry[],
  mutation?: CalendarEventMutationAdapter,
  extractedItems: readonly ExtractedItem[] = [],
) {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: "/month", element: <MonthPage mutation={mutation} /> },
          { path: "/today", element: <p>Today destination</p> },
        ],
      },
    ],
    { initialEntries },
  );

  render(
    <PrototypeStoreProvider>
      {extractedItems.length > 0 && (
        <SeedExtractedItems items={extractedItems} />
      )}
      <AiMateProvider>
        <RouterProvider router={router} />
      </AiMateProvider>
    </PrototypeStoreProvider>,
  );

  return router;
}

function SeedExtractedItems({ items }: { items: readonly ExtractedItem[] }) {
  const { dispatch } = usePrototypeStore();
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    dispatch({
      type: "extraction/applied",
      payload: {
        operationId: "month-page-test-extraction",
        document: {
          id: "month-page-test-document",
          userId: "user-demo-01",
          fileName: "sample-syllabus.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1_024,
          documentType: "syllabus",
          supportedFileFormat: "pdf",
          uploadStatus: "complete",
          extractionStatus: "complete",
          uploadedAt: "2026-07-01T00:00:00.000Z",
        },
        extractedItems: [...items],
      },
    });
  }, [dispatch, items]);

  return null;
}

describe("Month page integration", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(cleanup);

  it("renders the real Month route and replaces an invalid month with the demo month", async () => {
    const router = renderMonth(["/month?month=invalid"]);

    expect(await screen.findByRole("heading", { name: "2026년 7월" })).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.search).toBe("?month=2026-07");
      expect(router.state.historyAction).toBe("REPLACE");
    });
  });

  it("uses replace navigation for previous, next, and today", async () => {
    const user = userEvent.setup();
    const router = renderMonth(["/month?month=2026-07"]);

    await user.click(await screen.findByRole("button", { name: "이전 달" }));
    expect(router.state.location.search).toBe("?month=2026-06");
    expect(router.state.historyAction).toBe("REPLACE");

    await user.click(screen.getByRole("button", { name: "다음 달" }));
    expect(router.state.location.search).toBe("?month=2026-07");
    expect(router.state.historyAction).toBe("REPLACE");

    await user.click(screen.getByRole("button", { name: "오늘로 이동" }));
    expect(router.state.location.search).toBe("?month=2026-07");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("pushes one schedule-sheet entry and opens a native dialog for the selected date", async () => {
    const user = userEvent.setup();
    const router = renderMonth(["/month?month=2026-07"]);

    await user.click(
      await screen.findByRole("button", {
        name: "2026년 7월 24일 금요일, 일정 0개",
      }),
    );

    const dialog = screen.getByText("7월 24일 일정", { selector: "h2" }).closest("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(router.state.location.search).toBe(
      "?month=2026-07&date=2026-07-24&sheet=schedule",
    );
    expect(router.state.location.state).toEqual({ fromMonth: true });
    expect(router.state.historyAction).toBe("PUSH");
  });

  it("closes an internally opened sheet with back but cleans a direct deep link by replace", async () => {
    const user = userEvent.setup();
    const internalRouter = renderMonth(["/month?month=2026-07"]);
    await user.click(
      await screen.findByRole("button", {
        name: "2026년 7월 24일 금요일, 일정 0개",
      }),
    );
    fireEvent.click(screen.getByText("닫기", { selector: "button" }));
    await waitFor(() => {
      expect(internalRouter.state.location.search).toBe("?month=2026-07");
      expect(internalRouter.state.historyAction).toBe("POP");
    });

    cleanup();
    const directRouter = renderMonth([
      "/month?month=2026-07&date=2026-07-24&sheet=schedule",
    ]);
    fireEvent.click(await screen.findByText("닫기", { selector: "button" }));
    await waitFor(() => {
      expect(directRouter.state.location.search).toBe("?month=2026-07");
      expect(directRouter.state.historyAction).toBe("REPLACE");
    });
  });

  it("hides the AI Mate launcher while the sheet is open and restores it on close", async () => {
    const user = userEvent.setup();
    renderMonth(["/month?month=2026-07"]);

    expect(screen.getByLabelText("AI Mate 열기")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "2026년 7월 24일 금요일, 일정 0개",
      }),
    );
    expect(screen.queryByLabelText("AI Mate 열기")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("닫기", { selector: "button" }));
    expect(await screen.findByLabelText("AI Mate 열기")).toBeInTheDocument();
  });

  it("shows edit and delete only for CatchUp rows", async () => {
    connectDemoCalendar();
    const user = userEvent.setup();
    renderMonth(["/month?month=2026-07"]);

    await user.click(
      await screen.findByRole("button", {
        name: "2026년 7월 24일 금요일, 일정 1개",
      }),
    );
    expect(
      screen.getByText("개인 과제 정리 시간", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("수정", { selector: "button" })).toBeInTheDocument();
    expect(screen.getByText("삭제", { selector: "button" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("닫기", { selector: "button" }));
    await user.click(
      screen.getByRole("button", {
        name: "2026년 7월 22일 수요일, 일정 2개",
      }),
    );
    expect(screen.getByText("병원 예약")).toBeInTheDocument();
    expect(screen.queryByText("수정", { selector: "button" })).not.toBeInTheDocument();
    expect(screen.queryByText("삭제", { selector: "button" })).not.toBeInTheDocument();
  });

  it("creates a selected-date CatchUp event after adapter success and updates the calendar", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderMonth(["/month?month=2026-07&date=2026-07-24&sheet=schedule"], {
      save,
      delete: vi.fn(),
    });

    fireEvent.click(await screen.findByText("일정 추가", { selector: "button" }));
    expect(screen.getByLabelText("날짜")).toHaveValue("2026-07-24");
    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "스터디 준비" },
    });
    fireEvent.click(screen.getByText("저장", { selector: "button" }));

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(
      await screen.findByText("스터디 준비", { selector: "strong" }),
    ).toBeInTheDocument();
    const dateButton = document.querySelector<HTMLButtonElement>(
      'button[data-month-date="2026-07-24"]',
    );
    expect(dateButton?.querySelectorAll("[data-calendar-dot]")).toHaveLength(1);
  });

  it("keeps an edited date local until save succeeds, then moves the open sheet URL", async () => {
    connectDemoCalendar();
    let finishSave: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const router = renderMonth(
      ["/month?month=2026-07&date=2026-07-24&sheet=schedule"],
      { save, delete: vi.fn() },
    );

    fireEvent.click(await screen.findByText("수정", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("날짜"), {
      target: { value: "2026-08-03" },
    });
    expect(router.state.location.search).toBe(
      "?month=2026-07&date=2026-07-24&sheet=schedule",
    );
    expect(
      screen.getByText("개인 과제 정리 시간", { selector: "strong" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("저장", { selector: "button" }));
    expect(router.state.location.search).toBe(
      "?month=2026-07&date=2026-07-24&sheet=schedule",
    );
    finishSave?.();

    await waitFor(() => {
      expect(router.state.location.search).toBe(
        "?month=2026-08&date=2026-08-03&sheet=schedule",
      );
      expect(router.state.historyAction).toBe("REPLACE");
    });
    expect(
      await screen.findByText("8월 3일 일정", { selector: "h2" }),
    ).toBeInTheDocument();
  });

  it("cancels inline delete with focus return and deletes only after adapter success", async () => {
    connectDemoCalendar();
    const remove = vi.fn().mockResolvedValue(undefined);
    renderMonth(
      ["/month?month=2026-07&date=2026-07-24&sheet=schedule"],
      { save: vi.fn(), delete: remove },
    );

    const row = (await screen.findByText("개인 과제 정리 시간", {
      selector: "strong",
    })).closest("li")!;
    const deleteButton = within(row).getByText("삭제", { selector: "button" });
    fireEvent.click(deleteButton);
    expect(within(row).getByText("삭제할까요?")).toBeInTheDocument();
    fireEvent.click(within(row).getByText("취소", { selector: "button" }));
    expect(within(row).queryByText("삭제할까요?")).not.toBeInTheDocument();
    const restoredDeleteButton = within(row).getByText("삭제", {
      selector: "button",
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(restoredDeleteButton),
    );

    fireEvent.click(restoredDeleteButton);
    fireEvent.click(within(row).getByText("삭제", { selector: "button" }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(
      screen.queryByText("개인 과제 정리 시간", { selector: "strong" }),
    ).not.toBeInTheDocument();
  });

  it("retains a failed save draft and offers a successful retry", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(undefined);
    renderMonth(["/month?month=2026-07&date=2026-07-24&sheet=schedule"], {
      save,
      delete: vi.fn(),
    });

    fireEvent.click(await screen.findByText("일정 추가", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "재시도 일정" },
    });
    fireEvent.click(screen.getByText("저장", { selector: "button" }));

    expect(
      await screen.findByText("일정을 저장하지 못했어요. 다시 시도해주세요."),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("제목")).toHaveValue("재시도 일정");
    fireEvent.click(screen.getByText("다시 시도", { selector: "button" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("재시도 일정", { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("retains inline delete context on failure and retries successfully", async () => {
    connectDemoCalendar();
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error("delete failed"))
      .mockResolvedValueOnce(undefined);
    renderMonth(
      ["/month?month=2026-07&date=2026-07-24&sheet=schedule"],
      { save: vi.fn(), delete: remove },
    );
    const row = (await screen.findByText("개인 과제 정리 시간", {
      selector: "strong",
    })).closest("li")!;

    fireEvent.click(within(row).getByText("삭제", { selector: "button" }));
    fireEvent.click(within(row).getByText("삭제", { selector: "button" }));
    expect(
      await within(row).findByText("일정을 삭제하지 못했어요. 다시 시도해주세요."),
    ).toBeInTheDocument();
    expect(within(row).getByText("삭제할까요?")).toBeInTheDocument();

    fireEvent.click(within(row).getByText("다시 시도", { selector: "button" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByText("개인 과제 정리 시간", { selector: "strong" }),
    ).not.toBeInTheDocument();
  });

  it("confirms a dirty close and resumes only the chosen dismiss intent", async () => {
    const router = renderMonth([
      "/month?month=2026-07&date=2026-07-24&sheet=schedule",
    ]);
    fireEvent.click(await screen.findByText("일정 추가", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "작성 중 일정" },
    });

    fireEvent.click(screen.getByText("닫기", { selector: "button" }));
    expect(screen.getByText("변경사항을 버릴까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("계속 작성", { selector: "button" }));
    expect(screen.getByLabelText("제목")).toHaveValue("작성 중 일정");
    expect(router.state.location.search).toContain("sheet=schedule");

    fireEvent.click(screen.getByText("닫기", { selector: "button" }));
    fireEvent.click(screen.getByText("버리기", { selector: "button" }));
    await waitFor(() => expect(router.state.location.search).toBe("?month=2026-07"));
  });

  it("routes Escape, tab navigation, cancel, and delete through the dirty-intent confirmation", async () => {
    connectDemoCalendar();
    const router = renderMonth([
      "/month?month=2026-07&date=2026-07-24&sheet=schedule",
    ]);
    fireEvent.click(await screen.findByText("수정", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "수정 중" },
    });

    const dialog = screen.getByText("7월 24일 일정", { selector: "h2" }).closest("dialog")!;
    const cancelEvent = new Event("cancel", { cancelable: true });
    expect(fireEvent(dialog, cancelEvent)).toBe(false);
    expect(screen.getByText("변경사항을 버릴까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("계속 작성", { selector: "button" }));

    fireEvent.click(screen.getByText("Today").closest("a")!);
    expect(screen.getByText("변경사항을 버릴까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("계속 작성", { selector: "button" }));
    expect(router.state.location.pathname).toBe("/month");

    fireEvent.click(screen.getByText("취소", { selector: "button" }));
    expect(screen.getByText("변경사항을 버릴까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("계속 작성", { selector: "button" }));

    const row = screen
      .getByText("개인 과제 정리 시간", { selector: "strong" })
      .closest("li")!;
    fireEvent.click(within(row).getByText("삭제", { selector: "button" }));
    expect(screen.getByText("변경사항을 버릴까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("버리기", { selector: "button" }));
    expect(within(row).getByText("삭제할까요?")).toBeInTheDocument();
  });

  it("returns focus to the selected date button after dialog close", async () => {
    const user = userEvent.setup();
    renderMonth(["/month?month=2026-07"]);
    const dateButton = await screen.findByRole("button", {
      name: "2026년 7월 24일 금요일, 일정 0개",
    });
    await user.click(dateButton);
    const close = screen.getByText("닫기", { selector: "button" });
    close.focus();
    fireEvent.click(close);

    await waitFor(() => expect(document.activeElement).toBe(dateButton));
  });

  it("freezes the first pending intent and makes underlying controls inert", async () => {
    connectDemoCalendar();
    const router = renderMonth([
      "/month?month=2026-07&date=2026-07-24&sheet=schedule",
    ]);
    fireEvent.click(await screen.findByText("수정", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "작성 중인 제목" },
    });

    fireEvent.click(screen.getByText("닫기", { selector: "button" }));
    const confirmation = screen.getByText("변경사항을 버릴까요?");
    expect(
      screen
        .getByText("7월 24일 일정", { selector: "h2" })
        .closest("[inert]"),
    ).not.toBeNull();

    fireEvent.click(screen.getByText("일정 추가", { selector: "button" }));
    expect(confirmation).toBeInTheDocument();
    fireEvent.click(screen.getByText("버리기", { selector: "button" }));

    await waitFor(() => {
      expect(router.state.location.search).toBe("?month=2026-07");
    });
  });

  it("blocks navigation and dismiss interactions while an update is saving", async () => {
    connectDemoCalendar();
    let finishSave: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const router = renderMonth(
      ["/month?month=2026-07&date=2026-07-24&sheet=schedule"],
      { save, delete: vi.fn() },
    );
    fireEvent.click(await screen.findByText("수정", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("날짜"), {
      target: { value: "2026-08-03" },
    });
    fireEvent.click(screen.getByText("저장", { selector: "button" }));

    const dialog = screen
      .getByText("7월 24일 일정", { selector: "h2" })
      .closest("dialog")!;
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(dialog);
    fireEvent.click(screen.getByText("Today").closest("a")!);

    expect(router.state.location.pathname).toBe("/month");
    expect(router.state.location.search).toBe(
      "?month=2026-07&date=2026-07-24&sheet=schedule",
    );
    expect(screen.queryByText("변경사항을 버릴까요?")).not.toBeInTheDocument();
    expect(screen.getByText("닫기", { selector: "button" })).toBeDisabled();
    expect(screen.getByText("일정 추가", { selector: "button" })).toBeDisabled();
    expect(screen.getByText("취소", { selector: "button" })).toBeDisabled();

    finishSave?.();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/month");
      expect(router.state.location.search).toBe(
        "?month=2026-08&date=2026-08-03&sheet=schedule",
      );
    });
  });

  it("returns focus to the original invoking date after a moved update closes internally", async () => {
    connectDemoCalendar();
    const user = userEvent.setup();
    const router = renderMonth(["/month?month=2026-07"]);
    const originalDateButton = await screen.findByRole("button", {
      name: "2026년 7월 24일 금요일, 일정 1개",
    });
    await user.click(originalDateButton);
    fireEvent.click(await screen.findByText("수정", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("날짜"), {
      target: { value: "2026-08-03" },
    });
    fireEvent.click(screen.getByText("저장", { selector: "button" }));
    await waitFor(() => {
      expect(router.state.location.search).toBe(
        "?month=2026-08&date=2026-08-03&sheet=schedule",
      );
    });
    expect(
      await screen.findByText("8월 3일 일정", { selector: "h2" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(originalDateButton.isConnected).toBe(false));

    fireEvent.click(screen.getByText("닫기", { selector: "button" }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?month=2026-07");
      expect(document.activeElement).toBe(
        document.querySelector('button[data-month-date="2026-07-24"]'),
      );
    });
  });

  it("renders a timed extracted item with only its single start time", async () => {
    const extractedItem: ExtractedItem = {
      id: "extracted-timed-item",
      documentId: "month-page-test-document",
      title: "정규화 개념 퀴즈",
      itemType: "exam",
      courseName: "데이터베이스",
      date: "2026-07-25",
      time: "10:00",
      submissionMethod: "LMS 응시",
      requiredMaterials: null,
      difficulty: "medium",
      estimatedDurationMinutes: 120,
      reviewStatus: "confirmed",
      isUserEdited: false,
    };
    renderMonth(
      ["/month?month=2026-07&date=2026-07-25&sheet=schedule"],
      undefined,
      [extractedItem],
    );

    const row = (await screen.findByText("정규화 개념 퀴즈", {
      selector: "strong",
    })).closest("li")!;
    expect(within(row).getByText("10:00")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("null");
  });
});
