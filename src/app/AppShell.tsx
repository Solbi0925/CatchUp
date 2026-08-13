import { NavLink, Outlet } from "react-router-dom";
import { AiMateLayer } from "../features/ai-mate/AiMateLayer";
import { usePrototypeStore } from "../store/PrototypeStore";
import { CalendarIcon, HomeIcon, TabUploadIcon } from "../ui/icons";

export function AppShell() {
  const { state } = usePrototypeStore();
  const items = Object.values(state.extractedItemsById);
  const showCoachmark = items.length > 0 && items.every((item) => item.reviewStatus === "confirmed") && Object.keys(state.weeklyPlansById).length === 0;
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
