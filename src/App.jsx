import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { CallProvider } from "./contexts/CallContext";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RoomPage from "./pages/RoomPage";

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
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomId" element={<CallProvider><RoomPage /></CallProvider>} />
      </Route>
      <Route path="*" element={<Navigate to={firebaseUser ? "/" : "/login"} replace />} />
    </Routes>
  );
}