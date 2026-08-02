import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoadingScreen from './components/ui/LoadingScreen';
import Login from './pages/Login';

// The dashboard pulls in Leaflet and the field app pulls in livekit-client.
// Splitting them keeps the login entry chunk small on a field phone.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Streams = lazy(() => import('./pages/Streams'));
const DroneStudio = lazy(() => import('./pages/DroneStudio'));
const ScreenStudio = lazy(() => import('./pages/ScreenStudio'));
import FieldLayout from './pages/field/FieldLayout';
import FieldChat from './pages/field/FieldChat';
import FieldHome from './pages/field/FieldHome';
import FieldMission from './pages/field/FieldMission';
import FieldProfile from './pages/field/FieldProfile';
import FieldReport from './pages/field/FieldReport';
import type { RoleCode } from './lib/types';

const FieldStream = lazy(() => import('./pages/field/FieldStream'));
import { useAuth } from './store/auth';

function Protected({ allow, children }: { allow: RoleCode[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;

  return <>{children}</>;
}

export function homeFor(role: RoleCode): string {
  if (role === 'personnel') return '/app';
  if (role === 'drone') return '/drone';
  if (role === 'screen') return '/screen';
  return '/dashboard';
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Login />} />

      <Route
        path="/dashboard"
        element={
          <Protected allow={['superuser']}>
            <Dashboard />
          </Protected>
        }
      />

      <Route
        path="/streams"
        element={
          <Protected allow={['superuser']}>
            <Streams />
          </Protected>
        }
      />

      <Route
        path="/settings"
        element={
          <Protected allow={['superuser']}>
            <Settings />
          </Protected>
        }
      />

      <Route
        path="/drone"
        element={
          <Protected allow={['drone']}>
            <DroneStudio />
          </Protected>
        }
      />

      <Route
        path="/screen"
        element={
          <Protected allow={['screen']}>
            <ScreenStudio />
          </Protected>
        }
      />

      <Route
        path="/app"
        element={
          <Protected allow={['personnel']}>
            <FieldLayout />
          </Protected>
        }
      >
        <Route index element={<FieldHome />} />
        <Route path="stream" element={<FieldStream />} />
        <Route path="report" element={<FieldReport />} />
        <Route path="mission" element={<FieldMission />} />
        <Route path="chat" element={<FieldChat />} />
        <Route path="profile" element={<FieldProfile />} />
      </Route>

        <Route path="/" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
        <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
}
