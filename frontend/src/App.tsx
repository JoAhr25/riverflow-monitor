import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { LiveProvider } from "./services/live";
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

export default function App() {
  return (
    <BrowserRouter>
      <LiveProvider>
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
      </LiveProvider>
    </BrowserRouter>
  );
}
