import { Route, Routes, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TagsPage } from './tags/TagsPage';
import { ItemsPage } from './items/ItemsPage';
import { AuthProvider } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { RegisterPage } from './auth/RegisterPage';
import { ForgotPasswordPage } from './auth/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/ResetPasswordPage';
import { OnboardingPage } from './auth/OnboardingPage';
import { MfaSettingsPage } from './auth/MfaSettingsPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { DashboardPage } from './dashboard/DashboardPage';
import { ProfilePage } from './dashboard/ProfilePage';
import { AdminUsersPage } from './dashboard/AdminUsersPage';
import { AdminSystemPage } from './dashboard/AdminSystemPage';
import { ModerationQueuePage } from './dashboard/ModerationQueuePage';
import { PrayerRoomPage } from './room/PrayerRoomPage';
import { ModeratorRoomPage } from './room/ModeratorRoomPage';
import { ProgramsPage } from './room/ProgramsPage';
import { PrayerRequestsPage } from './prayer-requests/PrayerRequestsPage';
import { TestimoniesPage } from './testimonies/TestimoniesPage';
import { SocialPublicationsPage } from './testimonies/SocialPublicationsPage';
import { CommunitiesPage } from './communities/CommunitiesPage';
import { CommunityDetailPage } from './communities/CommunityDetailPage';
import { WorldMapPage } from './world-map/WorldMapPage';
import { AnalyticsDashboardPage } from './dashboard/AnalyticsDashboardPage';
import { NotificationsPage } from './dashboard/NotificationsPage';
import { CampaignsPage } from './dashboard/CampaignsPage';
import { EventsPage } from './events/EventsPage';
import { AiAccueilPage } from './ai/AiAccueilPage';
import { AiEvangelisationPage } from './ai/AiEvangelisationPage';
import { HeaderNav } from './HeaderNav';
import { WatchtowerMark } from './WatchtowerMark';
import { AccessProvider } from './auth/AccessContext';
import { AdminHomePage } from './admin/AdminHomePage';
import { RequireAccess } from './admin/RequireAccess';
import { ADMIN_PERMISSIONS, ADMIN_SECTIONS } from './admin/adminSections';
import { HomePage } from './home/HomePage';
import { FeedPage } from './social/FeedPage';
import { MemberProfilePage } from './social/MemberProfilePage';
import { MessagesPage } from './social/MessagesPage';

/** Permissions that open an administration page, from the same list the menus use. */
function perms(path: string): string[] {
  return ADMIN_SECTIONS.find((s) => s.to === path)?.permissions ?? ADMIN_PERMISSIONS;
}

export function App() {
  const { t } = useTranslation();
  return (
    <AuthProvider>
      <AccessProvider>
      <div className="app">
        <header className="site-header">
          <div className="header-top">
            <Link to="/" className="brand">
              <WatchtowerMark />
              <span className="brand-text">
                <h1>Tour d&apos;avant-garde</h1>
                <span className="brand-tagline">{t('app.tagline')}</span>
              </span>
            </Link>
            <p className="brand-verse">
              « {t('app.verse')} » <cite>{t('app.verseRef')}</cite>
            </p>
          </div>
          <HeaderNav />
        </header>
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/room" element={<PrayerRoomPage />} />
            <Route
              path="/room/moderate"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={perms('/room/moderate')}>
                    <ModeratorRoomPage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route
              path="/programs"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={perms('/programs')}>
                    <ProgramsPage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route path="/prayer-requests" element={<PrayerRequestsPage />} />
            <Route
              path="/testimonies"
              element={
                <ProtectedRoute>
                  <TestimoniesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/social-publications"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={perms('/social-publications')}>
                    <SocialPublicationsPage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route
              path="/fil"
              element={
                <ProtectedRoute>
                  <FeedPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages"
              element={
                <ProtectedRoute>
                  <MessagesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages/:id"
              element={
                <ProtectedRoute>
                  <MessagesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/membres/:id"
              element={
                <ProtectedRoute>
                  <MemberProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/communities"
              element={
                <ProtectedRoute>
                  <CommunitiesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/communities/:id"
              element={
                <ProtectedRoute>
                  <CommunityDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path="/world-map" element={<WorldMapPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/security/mfa"
              element={
                <ProtectedRoute>
                  <MfaSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={ADMIN_PERMISSIONS}>
                    <AdminHomePage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={perms('/admin/users')}>
                    <AdminUsersPage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={perms('/admin/analytics')}>
                    <AnalyticsDashboardPage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={perms('/admin/system')}>
                    <AdminSystemPage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/moderation"
              element={
                <ProtectedRoute>
                  <RequireAccess permissions={perms('/admin/moderation')}>
                    <ModerationQueuePage />
                  </RequireAccess>
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              }
            />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/assistant" element={<AiAccueilPage />} />
            <Route path="/foi" element={<AiEvangelisationPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/items" element={<ItemsPage />} />
          </Routes>
        </main>
      </div>
      </AccessProvider>
    </AuthProvider>
  );
}

export default App;
