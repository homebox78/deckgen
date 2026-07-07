import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { HomePage } from "../components/home/HomePage";
import { EditorPage } from "../components/editor/EditorPage";
import { OutlinePage } from "../components/outline/OutlinePage";
import { SharedEntryPage } from "../components/share/SharedEntryPage";
import { Toaster } from "../components/ui/toast";

const router = createBrowserRouter(
  [
    { path: "/", element: <HomePage /> },
    { path: "/deck/:id/outline", element: <OutlinePage /> },
    { path: "/deck/:id/edit", element: <EditorPage /> },
    { path: "/s/:token", element: <SharedEntryPage /> },
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
