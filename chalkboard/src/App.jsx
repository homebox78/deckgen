import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import LoginPage from "./pages/LoginPage.jsx";
import BoardListPage from "./pages/BoardListPage.jsx";
import BoardCreatePage from "./pages/BoardCreatePage.jsx";
import BoardDetailPage from "./pages/BoardDetailPage.jsx";
import BoardDecoratePage from "./pages/BoardDecoratePage.jsx";
import JoinPage from "./pages/JoinPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import Toaster from "./components/common/Toaster.jsx";

function Protected({ children }) {
  const { user, ready } = useAuthStore();
  if (!ready) return <div className="st-splash">🖍️ 불러오는 중…</div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const init = useAuthStore((s) => s.init);
  const ready = useAuthStore((s) => s.ready);
  useEffect(() => {
    init();
  }, [init]);

  if (!ready) return <div className="st-splash">🖍️ 우리동네 칠판 불러오는 중…</div>;

  return (
    <>
      <Toaster />
      <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/boards" element={<Protected><BoardListPage /></Protected>} />
      <Route path="/boards/new" element={<Protected><BoardCreatePage /></Protected>} />
      <Route path="/boards/:id" element={<Protected><BoardDetailPage /></Protected>} />
      <Route path="/boards/:id/decorate" element={<Protected><BoardDecoratePage /></Protected>} />
      <Route path="/join/:code" element={<Protected><JoinPage /></Protected>} />
      <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
      <Route path="*" element={<Navigate to="/boards" replace />} />
      </Routes>
    </>
  );
}
