import { useMemo } from "react";
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { PrototypeStoreProvider } from "../store/PrototypeStore";
import { AiMateProvider } from "../features/ai-mate/AiMateProvider";
import { ExtractionReviewPage } from "../features/upload/ExtractionReviewPage";
import { UploadPage } from "../features/upload/UploadPage";
import { AppShell } from "./AppShell";
import { RoutePlaceholder } from "./RoutePlaceholder";

const routes = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/upload" replace /> },
      { path: "upload", element: <UploadPage /> },
      { path: "today", element: <RoutePlaceholder title="Today" /> },
      { path: "month", element: <RoutePlaceholder title="Month" /> },
    ],
  },
  {
    path: "/upload/:documentId/extraction",
    element: <ExtractionReviewPage />,
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
