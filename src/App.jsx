import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { CallProvider } from "./contexts/CallContext";
import { DirectMessageProvider } from "./contexts/DirectMessageContext";
import { SocialProvider } from "./contexts/SocialContext";
import AppShell from "./components/AppShell";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RoomPage from "./pages/RoomPage";
import SettingsPage from "./pages/SettingsPage";
import WorkspacePage from "./pages/WorkspacePage";
import MomentsPage from "./pages/MomentsPage";
import VavagramPage from "./pages/VavagramPage";

function LoadingScreen() {
  return <main className="loading-screen"><span className="pulse-dot" />Conectando ao Vavagang</main>;
}

function ProtectedLayout() {
  const { firebaseUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  return <SocialProvider><DirectMessageProvider><CallProvider><Outlet /></CallProvider></DirectMessageProvider></SocialProvider>;
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
          <Route path="/search" element={<WorkspacePage section="search" />} />
          <Route path="/moments" element={<MomentsPage />} />
          <Route path="/vavagram" element={<VavagramPage />} />
          <Route path="/groups/:groupId" element={<WorkspacePage section="groups" />} />
          <Route path="/groups" element={<WorkspacePage section="groups" />} />
          <Route path="/channels/:channelId" element={<WorkspacePage section="channels" />} />
          <Route path="/voice/:voiceId" element={<WorkspacePage section="voice" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={firebaseUser ? "/" : "/login"} replace />} />
    </Routes>
  );
}