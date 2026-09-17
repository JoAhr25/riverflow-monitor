import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import Layout from "./components/Layout";
import { LiveProvider } from "./services/live";
import { authApi } from "./services/api";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import LiveCameraPage from "./pages/LiveCameraPage";
import FlowAnalysisPage from "./pages/FlowAnalysisPage";
import WaterLevelPage from "./pages/WaterLevelPage";
import DebrisPage from "./pages/DebrisPage";
import HistoryPage from "./pages/HistoryPage";
import ValidationPage from "./pages/ValidationPage";
import CalibrationPage from "./pages/CalibrationPage";
import SystemStatusPage from "./pages/SystemStatusPage";
import SettingsPage from "./pages/SettingsPage";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-slate-100 dark:bg-slate-950">
          <div className="max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Display Warning</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {this.state.error?.message || "An unexpected rendering error occurred."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-sky-500 hover:bg-sky-600 text-white"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type AuthState = "checking" | "login" | "ok";

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="live-camera" element={<LiveCameraPage />} />
        <Route path="flow" element={<FlowAnalysisPage />} />
        <Route path="water-level" element={<WaterLevelPage />} />
        <Route path="debris" element={<DebrisPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="validation" element={<ValidationPage />} />
        <Route path="calibration" element={<CalibrationPage />} />
        <Route path="system" element={<SystemStatusPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      authApi
        .check()
        .then((res) => {
          if (!cancelled) setAuthState(res.ok ? "ok" : "login");
        })
        .catch(() => {
          if (!cancelled) setAuthState("login");
        });
    };
    check();
    const onUnauthorized = () => setAuthState("login");
    window.addEventListener("rf-unauthorized", onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener("rf-unauthorized", onUnauthorized);
    };
  }, []);

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 dark:bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500 dark:border-slate-700" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Connecting to RiverFlow Monitor…</p>
      </div>
    );
  }

  if (authState === "login") {
    return (
      <ErrorBoundary>
        <LoginPage onSuccess={() => setAuthState("ok")} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <LiveProvider>
          <AppRoutes />
        </LiveProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
