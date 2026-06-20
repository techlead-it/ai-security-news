import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./web/layouts/RootLayout";
import { HomePage } from "./web/pages/HomePage";
import { ArticlePage } from "./web/pages/ArticlePage";
import { SourcesPage } from "./web/pages/SourcesPage";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Navigate to="/home" replace /> },
      { path: "/home", element: <HomePage /> },
      { path: "/sources", element: <SourcesPage /> },
      { path: "/articles/:id", element: <ArticlePage /> },
      { path: "*", element: <Navigate to="/home" replace /> },
    ],
  },
]);
