import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import AppShell from "../features/layout/AppShell";
import UploadLanding from "../features/upload/UploadLanding";
import AnonymizationMenu from "../features/anonymization/AnonymizationMenu";
import Dashboard from "../features/dashboard/Dashboard";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/upload" replace /> },
      { path: "upload", element: <UploadLanding /> },
      { path: "anonymize", element: <AnonymizationMenu /> },
      { path: "dashboard", element: <Dashboard /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
