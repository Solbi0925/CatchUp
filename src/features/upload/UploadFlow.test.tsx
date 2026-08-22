import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { academicEventFixture } from "../../test/academicEventFixture";
import * as extractionAdapter from "./extractionAdapter";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Upload flow", () => {
  it("도움말에서 계속 추가 업로드와 기존 일정 통합 방식을 안내한다", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);
    expect(screen.queryByLabelText("폴더")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "자료 업로드 도움말" }));
    const dialog = screen.getByRole("dialog", { name: "어떤 자료를 올릴 수 있나요?" });
    expect(dialog).toHaveTextContent("카카오톡 공지 캡처");
    expect(dialog).toHaveTextContent("기존 일정에 이어서 정리");
  });

  it("학업 정보가 0개인 결과는 완료가 아닌 추출 실패로 보여준다", async () => {
    const user = userEvent.setup(); render(<App initialEntries={["/upload"]} />);
    await user.upload(screen.getByLabelText("학업 자료 업로드"), new File(["blank"], "학업정보없음.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "모든 자료 통합 분석하기" }));
    expect(await screen.findByText("추출 실패")).toBeInTheDocument();
    expect(screen.getByText(/이 자료에서 학업 정보를 찾지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText("추출 완료")).not.toBeInTheDocument();
  });

  it("완료한 파일은 다시 보내지 않고 신규 파일만 기존 이벤트 맥락과 분석한다", async () => {
    const original = extractionAdapter.analyzeAcademicFiles;
    const analyzeSpy = vi.spyOn(extractionAdapter, "analyzeAcademicFiles").mockImplementation(original);
    const user = userEvent.setup(); render(<App initialEntries={["/upload"]} />);
    await user.upload(screen.getByLabelText("학업 자료 업로드"), new File(["first"], "강의계획서.pdf", { type: "application/pdf", lastModified: 1 }));
    await user.click(screen.getByRole("button", { name: "모든 자료 통합 분석하기" }));
    await screen.findByRole("status");
    await user.upload(screen.getByLabelText("학업 자료 업로드"), new File(["second"], "새로운_과제_명세서.pdf", { type: "application/pdf", lastModified: 2 }));
    await user.click(screen.getByRole("button", { name: "1개 신규 자료 분석하기" }));
    await waitFor(() => expect(analyzeSpy).toHaveBeenCalledTimes(2));
    expect(analyzeSpy.mock.calls[1][0].files.map((file) => file.name)).toEqual(["새로운_과제_명세서.pdf"]);
    expect(analyzeSpy.mock.calls[1][0].existingEvents.length).toBeGreaterThan(0);
  });

  it("파일명을 20자 이후 줄이고 compact preview 이후 파일은 펼칠 수 있다", async () => {
    const user = userEvent.setup(); render(<App initialEntries={["/upload"]} />);
    const files = Array.from({ length: 5 }, (_, index) => new File([String(index)], `${index}-아주아주긴학업자료파일이름입니다.pdf`, { type: "application/pdf", lastModified: index + 1 }));
    await user.upload(screen.getByLabelText("학업 자료 업로드"), files);
    expect(screen.getAllByText(/…$/)).toHaveLength(4);
    expect(screen.getByTitle(files[4].name)).toBeInTheDocument();
    expect(screen.queryByTitle(files[0].name)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "추가 자료 2개 보기" }));
    expect(screen.getByTitle(files[0].name)).toBeInTheDocument();
  });

  it("shows newly added pending files before completed files in the compact row", async () => {
    const user = userEvent.setup();
    const { container } = render(<App initialEntries={["/upload"]} />);
    await user.upload(screen.getByLabelText("학업 자료 업로드"), new File(["first"], "완료자료.pdf", { type: "application/pdf", lastModified: 1 }));
    await user.click(screen.getByRole("button", { name: "모든 자료 통합 분석하기" }));
    await screen.findByRole("status");
    await user.upload(screen.getByLabelText("학업 자료 업로드"), new File(["new"], "방금추가한자료.pdf", { type: "application/pdf", lastModified: 2 }));
    expect(getComputedStyle(container.querySelector(".selected-file-list")! as Element).display).toBe("flex");
    expect(container.querySelector(".document-card")?.getAttribute("title")).toBe("방금추가한자료.pdf");
    expect(screen.getByText("대기")).toBeInTheDocument();
    expect(screen.getByText("추출 완료", { selector: ".file-extraction-status" })).toBeInTheDocument();
  });

  it("keeps the unread notification dot beside the course title", () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({ updateNoticeStatus: "unread", courseName: "건축종합설계스튜디오(IV)" })]));
    render(<App initialEntries={["/upload/extraction"]} />);
    const dot = screen.getByLabelText("새 업데이트");
    expect(dot.parentElement).toHaveTextContent("건축종합설계스튜디오(IV)");
    expect(dot).toHaveClass("update-notice-dot");
    expect(getComputedStyle(dot).display).toBe("inline-block");
  });

  it("sorts scheduled weeks and exact dates on one academic-week timeline", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({ id: "week-4", title: "4주차 이벤트", date: null, scheduledWeek: 4, scheduledWeekLabel: "4주차", weekOneStartDate: "2026-08-17" }),
      academicEventFixture({ id: "exact-date", title: "정확한 날짜 이벤트", date: "2026-09-08", scheduledWeek: null, scheduledWeekLabel: null, weekOneStartDate: "2026-08-17" }),
      academicEventFixture({ id: "week-2", title: "2주차 이벤트", date: null, scheduledWeek: 2, scheduledWeekLabel: "2주차", weekOneStartDate: "2026-08-17" }),
      academicEventFixture({ id: "week-1", title: "1주차 이벤트", date: null, scheduledWeek: 1, scheduledWeekLabel: "1주차", weekOneStartDate: "2026-08-17" }),
      academicEventFixture({ id: "week-3", title: "3주차 이벤트", date: null, scheduledWeek: 3, scheduledWeekLabel: "3주차", weekOneStartDate: "2026-08-17" }),
    ]));
    const user = userEvent.setup();
    const { container } = render(<App initialEntries={["/upload/extraction"]} />);
    await user.click(screen.getByRole("button", { name: /UX 디자인\s+학업 이벤트/ }));

    const visibleTitles = () => [...container.querySelectorAll(".extraction-item__toggle strong")].map((element) => element.textContent);
    expect(visibleTitles()).toEqual(["1주차 이벤트", "2주차 이벤트", "3주차 이벤트", "4주차 이벤트", "정확한 날짜 이벤트"]);

    await user.click(screen.getByRole("button", { name: /정확한 날짜 이벤트/ }));
    const dateInput = screen.getByLabelText("날짜 / 마감일");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-09-01");
    expect(visibleTitles()).toEqual(["1주차 이벤트", "2주차 이벤트", "3주차 이벤트", "정확한 날짜 이벤트", "4주차 이벤트"]);
  });

  it("keeps hidden planning metadata while showing one week field and a compact all-day control", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([academicEventFixture({
      id: "hidden-metadata",
      title: "메타데이터 보존 과제",
      courseCode: "CD101",
      scheduledWeek: 10,
      scheduledWeekLabel: "Week 10",
      weekOneStartDate: "2026-08-17",
      submissionMethod: "LMS 과제함",
      researchNeeded: "high",
      deliverableComplexity: "영상과 인터랙션 포함",
    })]));
    const user = userEvent.setup();
    render(<App initialEntries={["/upload/extraction"]} />);
    await user.click(screen.getByRole("button", { name: /UX 디자인\s+학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: /메타데이터 보존 과제/ }));

    expect(screen.queryByText("과목 코드")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("1주차 시작일")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("제출 방식")).not.toBeInTheDocument();
    expect(screen.queryByText("자료 조사량")).not.toBeInTheDocument();
    expect(screen.queryByText("결과물 복잡도")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("예정 주차")).toHaveLength(1);
    expect(screen.getByLabelText("예정 주차")).toHaveValue("Week 10");

    const allDay = screen.getByLabelText("종일 일정");
    expect(allDay.parentElement).toHaveClass("all-day-toggle");
    expect(allDay.parentElement).toHaveTextContent("종일");
    expect(getComputedStyle(allDay).width).toBe("16px");

    await user.clear(screen.getByLabelText("예정 주차"));
    await user.type(screen.getByLabelText("예정 주차"), "11주차");
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));
    await waitFor(() => {
      const [stored] = JSON.parse(localStorage.getItem("catchup.academic-events.v2") ?? "[]");
      expect(stored).toMatchObject({
        scheduledWeek: 11,
        scheduledWeekLabel: "11주차",
        courseCode: "CD101",
        weekOneStartDate: "2026-08-17",
        submissionMethod: "LMS 과제함",
        researchNeeded: "high",
        deliverableComplexity: "영상과 인터랙션 포함",
      });
    });
  });

  it("keeps selected files and analysis running while navigating away from Upload", async () => {
    render(<App initialEntries={["/upload"]} />);
    expect(screen.getByText("이번 학기 학업 자료를 올려 주세요")).toBeInTheDocument();
    expect(screen.getByLabelText("업로드할 수 있는 학업 자료 예시")).toHaveTextContent("강의계획서과제 명세서시간표수업 공지시험 안내");
    expect(screen.getByText("새로운 학업 자료나 정보가 생기면 언제든지 추가해 주세요!")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /도시건축\s+학업 이벤트/ }));
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

  it("shows only four course preview cards inside one review-page entry area", async () => {
    const events = Array.from({ length: 6 }, (_, index) => academicEventFixture({
      id: `preview-${index + 1}`,
      title: `미리보기 이벤트 ${index + 1}`,
      courseName: `미리보기 과목 ${index + 1}`,
    }));
    window.localStorage.setItem("catchup.academic-events.v2", JSON.stringify(events));
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);

    expect(screen.getAllByRole("link", { name: "학업 이벤트 전체 확인 및 수정" })).toHaveLength(1);
    expect(screen.getAllByText(/미리보기 과목/)).toHaveLength(4);
    expect(screen.queryByText("미리보기 이벤트 1")).not.toBeInTheDocument();
    expect(screen.queryByText("미리보기 과목 5")).not.toBeInTheDocument();
    expect(screen.getByLabelText("추가 과목 2개")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "학업 이벤트 전체 확인 및 수정" }));
    expect(screen.getByRole("heading", { name: "학업 이벤트 확인 및 수정" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /미리보기 과목 \d\s+학업 이벤트 1개/ })).toHaveLength(6);
    expect(screen.queryByLabelText("이벤트명")).not.toBeInTheDocument();
  });

  it("opens a course review list directly from an Upload course preview", async () => {
    window.localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({
        id: "content-1",
        title: "콘텐츠 제작 1 과제",
        courseName: "콘텐츠디자인",
        itemType: "assignment",
        date: "2026-08-25",
      }),
      academicEventFixture({
        id: "strategy-1",
        title: "전략 수립 과제",
        courseName: "콘텐츠 디자인 전략 수립2",
        itemType: "assignment",
        date: "2026-08-28",
      }),
    ]));
    const user = userEvent.setup();
    render(<App initialEntries={["/upload"]} />);

    await user.click(screen.getByRole("link", { name: "콘텐츠디자인 학업 이벤트 1개 확인 및 수정" }));

    expect(screen.getByRole("heading", { name: "학업 이벤트 확인 및 수정" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "콘텐츠디자인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /콘텐츠 제작 1 과제/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /콘텐츠 디자인 전략 수립2\s+학업 이벤트/ })).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /UX 디자인\s+학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: /삭제할 이벤트/ }));
    await user.click(screen.getByRole("button", { name: "이 학업 이벤트 삭제" }));
    expect(confirm).toHaveBeenCalledWith('"삭제할 이벤트" 학업 이벤트를 삭제할까요?');
    expect(screen.queryByText("삭제할 이벤트")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));
    expect(await screen.findByText("UX 디자인")).toBeInTheDocument();
    expect(screen.getByText("학업 이벤트 1개")).toBeInTheDocument();
    expect(screen.queryByText("삭제할 이벤트")).not.toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("catchup.academic-events.v2") ?? "[]");
      expect(stored.map((item: { id: string }) => item.id)).toEqual(["keep-event"]);
    });
  });

  it("explains when same-course academic events should be merged", async () => {
    window.localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({ id: "merge-help-event" }),
    ]));
    const user = userEvent.setup();
    render(<App initialEntries={["/upload/extraction"]} />);

    const helpButton = screen.getByRole("button", { name: "이벤트 병합 도움말" });
    expect(helpButton).toHaveAttribute("aria-expanded", "false");
    await user.click(helpButton);

    expect(helpButton).toHaveAttribute("aria-expanded", "true");
    expect(getComputedStyle(helpButton).width).toBe("34px");
    expect(getComputedStyle(helpButton).height).toBe("34px");
    const tooltip = screen.getByRole("tooltip");
    const tooltipTitle = screen.getByRole("heading", { name: "이벤트 병합이란 무엇인가요?" });
    expect(tooltipTitle).toBeInTheDocument();
    expect(getComputedStyle(tooltipTitle).fontSize).toBe("15px");
    expect(tooltip).toHaveTextContent("AI 추출, 분석 과정에서 학업 이벤트가 두 개 이상의 학업 이벤트로 잘못 분리된 경우, 해당 이벤트를 선택하여 하나로 합칠 수 있어요");
  });

  it("merges selected events and keeps the merged draft open for review", async () => {
    localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({ id: "midterm-ko", title: "행정기획론 중간고사", isUserEdited: true }),
      academicEventFixture({ id: "midterm-en", title: "Midterm Exam", documentId: "doc-2", sourceDocumentIds: ["doc-2"], sourceReferences: [{ id: "source-2", documentId: "doc-2", fileName: "exam.pdf", documentType: "exam-notice", evidence: "Midterm Exam" }] }),
    ]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup(); render(<App initialEntries={["/upload/extraction"]} />);
    await user.click(screen.getByRole("button", { name: /UX 디자인\s+학업 이벤트/ }));
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
    await user.click(screen.getByRole("button", { name: /UX 디자인\s+학업 이벤트/ }));
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

    await user.click(screen.getByRole("button", { name: /UX 디자인\s+학업 이벤트/ }));
    expect(screen.getByText("미확정")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /과제 1/ }));
    await user.type(screen.getByLabelText("날짜 / 마감일"), "2026-09-02");
    await user.type(screen.getByLabelText("요구사항"), "분석 보고서 PDF 제출");
    await user.type(screen.getByLabelText("분량"), "A4 5쪽");
    expect(screen.getAllByText("확정").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));

    expect(await screen.findByText("UX 디자인")).toBeInTheDocument();
    expect(screen.getByText("학업 이벤트 1개")).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("catchup.academic-events.v2") ?? "[]");
      expect(stored[0]?.confirmationStatus).toBe("confirmed");
    });
  });

  it("keeps internal spaces in visible free-text fields and hides optional submission metadata", async () => {
    window.localStorage.setItem("catchup.academic-events.v2", JSON.stringify([
      academicEventFixture({
        id: "space-test",
        title: "Space test",
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

    await user.click(screen.getByRole("button", { name: /UX/ }));
    await user.click(screen.getByRole("button", { name: /Space test/ }));
    expect(screen.getByText("\uD655\uC815\uD558\uB824\uBA74 \uD544\uC694\uD55C \uC815\uBCF4").nextSibling).toHaveTextContent(
      "\uC815\uD655\uD55C \uB0A0\uC9DC, \uC694\uAD6C\uC0AC\uD56D, \uBD84\uB7C9",
    );

    const title = screen.getByLabelText("\uC774\uBCA4\uD2B8\uBA85");
    await user.clear(title);
    await user.type(title, "Final report");
    await user.type(screen.getByLabelText("\uB0A0\uC9DC / \uB9C8\uAC10\uC77C"), "2026-09-02");
    await user.type(screen.getByLabelText("\uC694\uAD6C\uC0AC\uD56D"), "Analysis report PDF");
    await user.type(screen.getByLabelText("\uBD84\uB7C9"), "A4 5 pages");

    expect(title).toHaveValue("Final report");
    expect(screen.getByLabelText("\uC694\uAD6C\uC0AC\uD56D")).toHaveValue("Analysis report PDF");
    expect(screen.getByLabelText("\uBD84\uB7C9")).toHaveValue("A4 5 pages");
    expect(screen.getAllByText("\uD655\uC815").length).toBeGreaterThan(0);

    expect(screen.queryByLabelText("\uC81C\uCD9C \uBC29\uC2DD")).not.toBeInTheDocument();
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

    await screen.findByText("UX 디자인", {}, { timeout: 2_000 });
    expect(screen.getByRole("status")).toHaveTextContent("추출 완료");
    expect(screen.queryByText("이벤트 중심 결과 확인 및 수정")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "학업 이벤트 전체 확인 및 수정" }));

    expect(
      screen.getByRole("heading", { name: "학업 이벤트 확인 및 수정" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("이벤트명")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /UX 디자인\s+학업 이벤트/ }));
    await user.click(screen.getByRole("button", { name: /UX 리서치 보고서/ }));
    const titleInput = screen.getByLabelText("이벤트명");
    await user.clear(titleInput);
    await user.type(titleInput, "사용자 수정 UX 리서치 보고서");
    await user.click(screen.getByRole("button", { name: "학업 이벤트 저장" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "자료 업로드" })).toBeInTheDocument();
    });
    expect(screen.getByText("UX 디자인")).toBeInTheDocument();
    expect(screen.getByText("학업 이벤트 1개")).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("catchup.academic-events.v2") ?? "[]");
      expect(stored.some((item: { title: string }) => item.title === "사용자 수정 UX 리서치 보고서")).toBe(true);
    });
  });
});
