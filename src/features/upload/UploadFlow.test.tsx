import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { academicEventFixture } from "../../test/academicEventFixture";

afterEach(cleanup);

describe("Upload flow", () => {
  it("keeps selected files and analysis running while navigating away from Upload", async () => {
    render(<App initialEntries={["/upload"]} />);
    expect(screen.getByText("이번 학기 학업 자료를 한꺼번에 올려주세요")).toBeInTheDocument();
    expect(screen.getByLabelText("업로드할 수 있는 학업 자료 예시")).toHaveTextContent("강의계획서과제 명세서시간표수업 공지시험 안내");
    expect(screen.getByText("PDF와 이미지 모두 가능 · 순서에 상관없이 여러 개 선택")).toBeInTheDocument();
    const file = new File(["syllabus"], "강의계획서.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("학업 자료 업로드"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "모든 자료 통합 분석하기" }));

    fireEvent.click(screen.getByRole("link", { name: "Today" }));
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Upload" }));

    expect(screen.getByText("강의계획서.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1개 자료 통합 분석 중..." })).toBeDisabled();
    expect(await screen.findByRole("status")).toHaveTextContent("추출 완료");
    expect(screen.getByText("강의계획서.pdf")).toBeInTheDocument();
  });

  it("reviews timetable class times and shows them in Today's schedule without a weekly plan", async () => {
    window.sessionStorage.setItem("catchup:prototype:onboarding:v1", JSON.stringify({
      version: 1,
      introSeen: true,
      calendarStep: "connected",
      calendarConnected: true,
    }));
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);

    await user.upload(
      screen.getByLabelText("학업 자료 업로드"),
      new File(["timetable"], "2026-1학기_시간표.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "모든 자료 통합 분석하기" }));
    expect(await screen.findByRole("status")).toHaveTextContent("추출 완료");
    await user.click(await screen.findByRole("link", { name: "학업 이벤트 전체 확인 및 수정" }));
    await user.click(screen.getByRole("button", { name: /도시건축학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: /도시건축/ }));

    expect(screen.getByLabelText("수업 1 요일")).toHaveValue("1");
    expect(screen.getByLabelText("수업 1 강의실")).toHaveValue("401-930");
    expect(screen.queryByText("분량")).not.toBeInTheDocument();
    expect(screen.queryByText("요구사항")).not.toBeInTheDocument();
    expect(screen.queryByText("자료 조사량")).not.toBeInTheDocument();
    expect(screen.queryByText("객관적 난이도")).not.toBeInTheDocument();
    expect(screen.queryByText("결과물 복잡도")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("수업 1 시작 시간"));
    await user.type(screen.getByLabelText("수업 1 시작 시간"), "10:00");
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));
    await user.click(await screen.findByRole("link", { name: "Today" }));

    expect(screen.getByRole("heading", { name: "오늘의 예정 일정" })).toBeInTheDocument();
    expect(screen.getByText("도시건축 · 401-930")).toBeInTheDocument();
    expect(screen.getByText("10:00–11:45")).toBeInTheDocument();
  });

  it("shows only four preview cards inside one review-page entry area", async () => {
    const events = Array.from({ length: 6 }, (_, index) => academicEventFixture({
      id: `preview-${index + 1}`,
      title: `미리보기 이벤트 ${index + 1}`,
    }));
    window.localStorage.setItem("catchup.academic-events.v2", JSON.stringify(events));
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);

    expect(screen.getAllByRole("link", { name: "학업 이벤트 전체 확인 및 수정" })).toHaveLength(1);
    expect(screen.getAllByText(/미리보기 이벤트/)).toHaveLength(4);
    expect(screen.queryByText("미리보기 이벤트 5")).not.toBeInTheDocument();
    expect(screen.getByLabelText("추가 학업 이벤트 2개")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "학업 이벤트 전체 확인 및 수정" }));
    expect(screen.getByRole("heading", { name: "학업 이벤트 확인 및 수정" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /UX 디자인학업 이벤트/ }));
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(6);
    expect(screen.queryByLabelText("이벤트명")).not.toBeInTheDocument();
  });

  it("deletes an academic event from review only after saving", async () => {
    const events = [
      academicEventFixture({ id: "keep-event", title: "남길 이벤트" }),
      academicEventFixture({ id: "delete-event", title: "삭제할 이벤트" }),
    ];
    window.localStorage.setItem("catchup.academic-events.v2", JSON.stringify(events));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App initialEntries={["/upload/extraction"]} />);

    await user.click(screen.getByRole("button", { name: /UX 디자인학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: /삭제할 이벤트/ }));
    await user.click(screen.getByRole("button", { name: "이 학업 이벤트 삭제" }));
    expect(confirm).toHaveBeenCalledWith('"삭제할 이벤트" 학업 이벤트를 삭제할까요?');
    expect(screen.queryByText("삭제할 이벤트")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));
    expect(await screen.findByText("남길 이벤트")).toBeInTheDocument();
    expect(screen.queryByText("삭제할 이벤트")).not.toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("catchup.academic-events.v2") ?? "[]");
      expect(stored.map((item: { id: string }) => item.id)).toEqual(["keep-event"]);
    });
  });

  it("merges selected events and keeps the merged draft open for review", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({ id: "midterm-ko", title: "행정기획론 중간고사", isUserEdited: true }),
      academicEventFixture({ id: "midterm-en", title: "Midterm Exam", documentId: "doc-2", sourceDocumentIds: ["doc-2"], sourceReferences: [{ id: "source-2", documentId: "doc-2", fileName: "exam.pdf", documentType: "exam-notice", evidence: "Midterm Exam" }] }),
    ]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup(); render(<App initialEntries={["/upload/extraction"]} />);
    await user.click(screen.getByRole("button", { name: /UX 디자인학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: "이벤트 병합" }));
    const selections = screen.getAllByRole("checkbox", { name: "병합 선택" });
    await user.click(selections[0]); await user.click(selections[1]);
    await user.click(screen.getByRole("button", { name: "선택 이벤트 병합 (2)" }));
    expect(screen.getByText(/이벤트 1개/)).toBeInTheDocument();
    expect(screen.getByLabelText("이벤트명")).toHaveValue("행정기획론 중간고사");
    expect(screen.getByText("exam.pdf")).toBeInTheDocument();
  });

  it("splits a merged event into source-backed review drafts", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "merged-event", sourceDocumentIds: ["doc-1", "doc-2"], sourceReferences: [
        { id: "source-1", documentId: "doc-1", fileName: "syllabus.pdf", documentType: "syllabus", evidence: "8주차" },
        { id: "source-2", documentId: "doc-2", fileName: "notice.pdf", documentType: "exam-notice", evidence: "시험 공지" },
      ],
    })]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup(); render(<App initialEntries={["/upload/extraction"]} />);
    await user.click(screen.getByRole("button", { name: /UX 디자인학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: /보고서/ }));
    await user.click(screen.getByRole("button", { name: "원본 자료 기준으로 이벤트 분리" }));
    expect(screen.getByText(/이벤트 2개/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /보고서 \(분리 1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /보고서 \(분리 2\)/ })).toBeInTheDocument();
  });

  it("promotes an unconfirmed event when the user supplies its missing core information", async () => {
    window.localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({
        id: "unconfirmed-assignment",
        title: "과제 1",
        date: null,
        requirements: null,
        workload: null,
        submissionMethod: null,
        confirmationStatus: "unconfirmed",
        confirmationIssues: ["missing-date", "missing-details"],
      }),
    ]));
    const user = userEvent.setup();
    render(<App initialEntries={["/upload/extraction"]} />);

    await user.click(screen.getByRole("button", { name: /UX 디자인학업 이벤트/ }));
    expect(screen.getByText("미확정")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /과제 1/ }));
    await user.type(screen.getByLabelText("날짜 / 마감일"), "2026-09-02");
    await user.type(screen.getByLabelText("요구사항"), "분석 보고서 PDF 제출");
    await user.type(screen.getByLabelText("분량"), "A4 5쪽");
    await user.type(screen.getByLabelText("제출 방식"), "LMS 과제함");
    expect(screen.getAllByText("확정").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));

    expect(await screen.findByText("과제 1")).toBeInTheDocument();
    expect(screen.getByText("확정")).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("catchup.academic-events.v2") ?? "[]");
      expect(stored[0]?.confirmationStatus).toBe("confirmed");
    });
  });

  it("uploads files together, reviews one integrated event, confirms it and returns to Upload", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);

    expect(screen.getByRole("heading", { name: "자료 업로드" })).toBeInTheDocument();
    const input = screen.getByLabelText("학업 자료 업로드");
    await user.upload(
      input,
      [
        new File(["sample"], "강의계획서.pdf", { type: "application/pdf" }),
        new File(["notice"], "LMS_공지.png", { type: "image/png" }),
      ],
    );

    expect(screen.getByText("강의계획서.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "모든 자료 통합 분석하기" }));
    expect(screen.getByRole("button", { name: "2개 자료 통합 분석 중..." })).toBeDisabled();

    await screen.findByText("UX 리서치 보고서", {}, { timeout: 2_000 });
    expect(screen.getByRole("status")).toHaveTextContent("추출 완료");
    expect(screen.queryByText("이벤트 중심 결과 확인 및 수정")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "학업 이벤트 전체 확인 및 수정" }));

    expect(
      screen.getByRole("heading", { name: "학업 이벤트 확인 및 수정" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("이벤트명")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /UX 디자인학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: /UX 리서치 보고서/ }));
    const titleInput = screen.getByLabelText("이벤트명");
    await user.clear(titleInput);
    await user.type(titleInput, "사용자 수정 UX 리서치 보고서");
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "자료 업로드" })).toBeInTheDocument();
    });
    expect(screen.getByText("사용자 수정 UX 리서치 보고서")).toBeInTheDocument();
    expect(screen.getAllByText("확정")).toHaveLength(3);
  });
});
