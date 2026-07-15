import { Navigate, Route, Routes } from "react-router-dom";

import { BottomNav } from "@/components/layout/BottomNav";
import InboxPage from "@/pages/InboxPage";
import ReviewPage from "@/pages/ReviewPage";
import SettingsPage from "@/pages/SettingsPage";
import TasksPage from "@/pages/TasksPage";
import TodayPage from "@/pages/TodayPage";

export default function App() {
  return (
    <>
      <div className="mx-auto min-h-screen max-w-app bg-bg with-nav-gap">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </>
  );
}
