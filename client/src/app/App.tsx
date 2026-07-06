import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { HomePage } from "../components/home/HomePage";
import { EditorPage } from "../components/editor/EditorPage";
import { OutlinePage } from "../components/outline/OutlinePage";
import { Toaster } from "../components/ui/toast";

const router = createBrowserRouter(
  [
    { path: "/", element: <HomePage /> },
    { path: "/deck/:id/outline", element: <OutlinePage /> },
    { path: "/deck/:id/edit", element: <EditorPage /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);

export function App() {
  return (
    <>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Toaster />
    </>
  );
}
