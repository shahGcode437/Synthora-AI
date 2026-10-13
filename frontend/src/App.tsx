import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { AuthProvider, PUBLIC_APP_PATHS, useAuth } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import { Spinner } from "./components/ui";
import { LoginPage, SignupPage } from "./pages/AuthPages";
import { AboutContent } from "./pages/AboutPage";
import { HelpContent } from "./pages/HelpPage";
import { DatasetsPage } from "./pages/manage/DatasetsPage";
import { HistoryPage } from "./pages/manage/HistoryPage";
import { OverviewPage } from "./pages/manage/OverviewPage";
import { ProfilePage } from "./pages/manage/ProfilePage";
import { SchemasPage } from "./pages/manage/SchemasPage";
import { NotFound, PublicPage } from "./pages/PublicLayout";
import { WorkspaceRoute } from "./pages/Workspaces";
import { DocumentsPage } from "./pages/data/DocumentsPage";
import { RelationalPage } from "./pages/data/RelationalPage";
import { TabularPage } from "./pages/data/TabularPage";
import { Redirect, Router, useRouter } from "./router";
import { AppShell } from "./shell/AppShell";
import { AppProvider } from "./state/AppContext";

// The landing page is the heaviest public asset and is not needed inside the app, so it loads on demand.
const Landing = lazy(() => import("./pages/Landing").then((m) => ({ default: m.Landing })));

const TITLES: Record<string, string> = {
  overview: "Overview", input: "Input", analyze: "Analyze", plan: "Generation Plan", generate: "Generate", validate: "Validate", quality: "Quality & Fidelity",
  export: "Export", tabular: "Tabular Data", relational: "Relational Data", documents: "Document Data", schemas: "Schemas", datasets: "Datasets",
  history: "Generation History", profile: "Profile", settings: "Settings", help: "Help", about: "About",
};

const Loading = () => <div className="grid min-h-screen place-items-center"><Spinner /></div>;

/** Account-only pages send guests to sign in, and bring them back afterwards. */
function RequireAuth({ path, children }: { path: string; children: ReactNode }) {
  const { status } = useAuth();
  if (PUBLIC_APP_PATHS.has(path)) return <>{children}</>;
  if (status === "loading") return <Loading />;
  if (status === "guest") return <Redirect to={`/login?next=${encodeURIComponent(path)}`} />;
  return <>{children}</>;
}

function AppPage({ name }: { name: string }) {
  switch (name) {
    case "overview": return <OverviewPage />;
    case "tabular": return <TabularPage />;
    case "relational": return <RelationalPage />;
    case "documents": return <DocumentsPage />;
    case "schemas": return <SchemasPage />;
    case "datasets": return <DatasetsPage />;
    case "history": return <HistoryPage />;
    case "profile": return <ProfilePage />;
    default: return <WorkspaceRoute name={name} />;
  }
}

function Routes() {
  const { path } = useRouter();
  useEffect(() => {
    const sub = path.startsWith("/app/") ? TITLES[path.slice(5)] : undefined;
    document.title = sub ? `${sub} · Synthora AI`
      : path === "/about" ? "About · Synthora AI" : path === "/docs" ? "Documentation · Synthora AI"
      : path === "/login" ? "Sign in · Synthora AI" : path === "/signup" ? "Create account · Synthora AI" : "Synthora AI — Synthetic Data Platform";
  }, [path]);

  if (path === "/") return <Suspense fallback={<Loading />}><Landing /></Suspense>;
  if (path === "/about") return <PublicPage><AboutContent /></PublicPage>;
  if (path === "/docs") return <PublicPage><HelpContent pub /></PublicPage>;
  if (path === "/login") return <LoginPage />;
  if (path === "/signup") return <SignupPage />;
  if (path === "/app") return <Redirect to="/app/overview" />;
  if (path.startsWith("/app/")) {
    return <RequireAuth path={path}><AppShell><AppPage name={path.slice(5)} /></AppShell></RequireAuth>;
  }
  return <NotFound />;
}

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <AppProvider>
            <Routes />
          </AppProvider>
        </AuthProvider>
      </ToastProvider>
    </Router>
  );
}
