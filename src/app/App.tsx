import { useMemo } from "react";
import {
  createBrowserRouter,
  createMemoryRouter,
  RouterProvider,
} from "react-router-dom";
import { PrototypeStoreProvider } from "../store/PrototypeStore";
import { AiMateProvider } from "../features/ai-mate/AiMateProvider";
import { ExtractionReviewPage } from "../features/upload/ExtractionReviewPage";
import { UploadPage } from "../features/upload/UploadPage";
import { IntroPage } from "../features/intro/IntroPage";
import { CalendarOnboardingPage } from "../features/onboarding/CalendarOnboardingPage";
import { TodayPage } from "../features/today/TodayPage";
import { MonthPage } from "../features/month/MonthPage";
import { AppShell } from "./AppShell";
import { InitialRoute } from "./InitialRoute";

const routes = [
  {
    path: "/onboarding/intro",
    element: <IntroPage />,
  },
  {
    path: "/onboarding/calendar",
    element: <CalendarOnboardingPage />,
  },
  {
    path: "/",
    element: <InitialRoute />,
  },
  {
    element: <AppShell />,
    children: [
      { path: "upload", element: <UploadPage /> },
      { path: "today", element: <TodayPage /> },
      { path: "month", element: <MonthPage /> },
    ],
  },
  {
    path: "/upload/extraction",
    element: <ExtractionReviewPage />,
  },
  {
    path: "*",
    element: <InitialRoute />,
  },
];

export function App({ initialEntries }: { initialEntries?: string[] }) {
  const router = useMemo(
    () =>
      initialEntries
        ? createMemoryRouter(routes, { initialEntries })
        : createBrowserRouter(routes),
    [initialEntries],
  );
  return (
    <PrototypeStoreProvider>
      <AiMateProvider>
        <RouterProvider router={router} />
      </AiMateProvider>
    </PrototypeStoreProvider>
  );
}
