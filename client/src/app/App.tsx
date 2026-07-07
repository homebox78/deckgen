import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AdminPage } from "../components/admin/AdminPage";
import { HomePage } from "../components/home/HomePage";
import { EditorPage } from "../components/editor/EditorPage";
import { OutlinePage } from "../components/outline/OutlinePage";
import { SharedEntryPage } from "../components/share/SharedEntryPage";
import { BannerBar } from "../components/ui/BannerBar";
import { Toaster } from "../components/ui/toast";

function withBanner(el: React.ReactNode) {
  return (
    <div className="flex h-screen flex-col">
      <BannerBar />
      <div className="min-h-0 flex-1">{el}</div>
    </div>
  );
}

const router = createBrowserRouter(
  [
    { path: "/", element: withBanner(<HomePage />) },
    { path: "/deck/:id/outline", element: withBanner(<OutlinePage />) },
    { path: "/deck/:id/edit", element: withBanner(<EditorPage />) },
    { path: "/s/:token", element: <SharedEntryPage /> },
    { path: "/admin", element: <AdminPage /> },
  ],
  {
    future: { v7_relativeSplatPath: true },
    // 운영 서브디렉터리(/deckGen) 대응
    basename: import.meta.env.BASE_URL.replace(/\/$/, "") || undefined,
  },
);

export function App() {
  return (
    <>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Toaster />
    </>
  );
}
