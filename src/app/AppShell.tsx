import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AiMateLayer } from "../features/ai-mate/AiMateLayer";
import { CalendarIcon, HomeIcon, TabUploadIcon } from "../ui/icons";

export function AppShell() {
  const location = useLocation();
  const showCoachmark = Boolean(
    (location.state as { showAiMateCoachmark?: boolean } | null)?.showAiMateCoachmark,
  );
  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <AiMateLayer showCoachmark={showCoachmark} />
      <nav className="bottom-tabs" aria-label="하단 탐색">
        <NavLink to="/today" className="bottom-tab">
          <HomeIcon />
          <span>Today</span>
        </NavLink>
        <NavLink to="/month" className="bottom-tab">
          <CalendarIcon />
          <span>Month</span>
        </NavLink>
        <NavLink to="/upload" className="bottom-tab">
          <TabUploadIcon />
          <span>Upload</span>
        </NavLink>
      </nav>
    </div>
  );
}
