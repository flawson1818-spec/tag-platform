import { Route, Routes, Link } from 'react-router-dom';
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
import { HomePage } from './home/HomePage';

export function App() {
  return (
    <AuthProvider>
      <div className="app">
        <header>
          <Link to="/" className="brand">
            <h1>TAG</h1>
            <p className="brand-tagline">Total Adoration &amp; Global Intercession</p>
          </Link>
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
                  <ModeratorRoomPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/programs"
              element={
                <ProtectedRoute>
                  <ProgramsPage />
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
                  <SocialPublicationsPage />
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
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute>
                  <AnalyticsDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system"
              element={
                <ProtectedRoute>
                  <AdminSystemPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/moderation"
              element={
                <ProtectedRoute>
                  <ModerationQueuePage />
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
    </AuthProvider>
  );
}

export default App;
