import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { CallProvider } from "./contexts/CallContext";
import AppShell from "./components/AppShell";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RoomPage from "./pages/RoomPage";
import SettingsPage from "./pages/SettingsPage";
import WorkspacePage from "./pages/WorkspacePage";
import MomentsPage from "./pages/MomentsPage";

function LoadingScreen() {
  return <main className="loading-screen"><span className="pulse-dot" />Conectando ao Vavagang</main>;
}

function ProtectedLayout() {
  const { firebaseUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  const { firebaseUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={firebaseUser ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/friends" element={<WorkspacePage section="friends" />} />
          <Route path="/requests" element={<WorkspacePage section="requests" />} />
          <Route path="/messages" element={<WorkspacePage section="messages" />} />
          <Route path="/moments" element={<MomentsPage />} />
          <Route path="/groups/:groupId" element={<WorkspacePage section="groups" />} />
          <Route path="/channels/:channelId" element={<WorkspacePage section="channels" />} />
          <Route path="/voice/:voiceId" element={<WorkspacePage section="voice" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/room/:roomId" element={<CallProvider><RoomPage /></CallProvider>} />
      </Route>
      <Route path="*" element={<Navigate to={firebaseUser ? "/" : "/login"} replace />} />
    </Routes>
  );
}