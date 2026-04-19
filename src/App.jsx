import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { createHashRouter, RouterProvider, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from './pages/Login';
import AIDiagnosis from './pages/AIDiagnosis';
import VideoCall from './pages/VideoCall';
import DispensaryAnalytics from './pages/DispensaryAnalytics';
import { ErrorBoundary } from './components/ErrorBoundary';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

import { useLocation } from 'react-router-dom';

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, authError } = useAuth();

  console.debug('AuthenticatedApp render', location.pathname, { isLoadingAuth, authError });

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'auth_unavailable') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="max-w-lg bg-white rounded-xl shadow-lg p-10 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Access restricted</h1>
          <p className="mt-4 text-slate-600">
            Authentication is not available. Please contact your vendor to register a user.
          </p>
        </div>
      </div>
    );
  }

  if (authError?.type === 'auth_required') {
    // Render the login screen directly when auth is required. This avoids
    // navigation issues when the router context is not yet fully established.
    return <Login />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/AIDiagnosis" element={
        <LayoutWrapper currentPageName="AIDiagnosis">
          <AIDiagnosis />
        </LayoutWrapper>
      } />
      <Route path="/VideoCall" element={<VideoCall />} />
      <Route path="/DispensaryAnalytics" element={
        <LayoutWrapper currentPageName="DispensaryAnalytics">
          <DispensaryAnalytics />
        </LayoutWrapper>
      } />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

const router = createHashRouter(
  [
    {
      path: '/*',
      element: <AuthenticatedApp />,
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_startTransition: true,
    },
  }
);


function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <RouterProvider router={router} />
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App