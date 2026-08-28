import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import React, { lazy, Suspense } from "react";
import { useAuth } from "./contexts/AuthContext";
import { CallProvider } from "./contexts/CallContext";
import { DirectMessageProvider } from "./contexts/DirectMessageContext";
import { SocialProvider } from "./contexts/SocialContext";
import { SoundEffectsProvider } from "./contexts/SoundEffectsContext";
import { getErrorMessage } from "./utils/errorMessage";
const AppShell = lazy(() => import("./components/AppShell"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RoomPage = lazy(() => import("./pages/RoomPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage"));
const MomentsPage = lazy(() => import("./pages/MomentsPage"));
const VavagramPage = lazy(() => import("./pages/VavagramPage"));
const VavaXPage = lazy(() => import("./pages/VavaXPage"));
const FortniteShopPage = lazy(() => import("./pages/FortniteShopPage"));

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="runtime-error-screen">
        <p className="eyebrow">VAVAGANG // erro de inicialização</p>
        <h1>Não foi possível carregar esta tela.</h1>
        <p>Atualize a página. Se o problema continuar, copie esta mensagem para o suporte:</p>
        <code>{getErrorMessage(this.state.error)}</code>
        <button className="primary-button" onClick={() => window.location.reload()}>Recarregar aplicação</button>
      </main>
    );
  }
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="pulse-dot" />Conectando ao Vavagang</main>;
}

function ProtectedLayout() {
  const { firebaseUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  return <SocialProvider><DirectMessageProvider><CallProvider><SoundEffectsProvider><Outlet /></SoundEffectsProvider></CallProvider></DirectMessageProvider></SocialProvider>;
}

function RouteLoadingScreen() {
  return <main className="loading-screen"><span className="pulse-dot" />Carregando tela</main>;
}

export default function App() {
  const { firebaseUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <AppErrorBoundary>
      <Suspense fallback={<RouteLoadingScreen />}>
        <Routes>
      <Route path="/login" element={firebaseUser ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<VavaXPage />} />
          <Route path="/friends" element={<WorkspacePage section="friends" />} />
          <Route path="/requests" element={<WorkspacePage section="requests" />} />
          <Route path="/messages" element={<WorkspacePage section="messages" />} />
          <Route path="/search" element={<WorkspacePage section="search" />} />
          <Route path="/moments" element={<MomentsPage />} />
          <Route path="/vavagram" element={<VavagramPage />} />
          <Route path="/vavax" element={<VavaXPage />} />
          <Route path="/fortnite" element={<FortniteShopPage />} />
          <Route path="/channels/:channelId" element={<WorkspacePage section="channels" />} />
          <Route path="/voice/:voiceId" element={<WorkspacePage section="voice" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={firebaseUser ? "/" : "/login"} replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}