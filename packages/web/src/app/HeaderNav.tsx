import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { InstallPwaButton } from './InstallPwaButton';
import { useUnreadMessages } from './social/useUnreadMessages';
import { useAccess } from './auth/AccessContext';
import { ADMIN_PERMISSIONS } from './admin/adminSections';

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'active' : '';
}

export function HeaderNav() {
  const { status, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const unread = useUnreadMessages(status === 'authenticated');
  const { canAny } = useAccess();
  const isAdmin = status === 'authenticated' && canAny(ADMIN_PERMISSIONS);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav>
      <div className="nav-primary">
        <NavLink to="/" end className={navClass}>{t('nav.home')}</NavLink>
        <NavLink to="/room" className={navClass}>{t('nav.room')}</NavLink>
        <NavLink to="/prayer-requests" className={navClass}>{t('nav.prayerRequests')}</NavLink>
        <NavLink to="/testimonies" className={navClass}>{t('nav.testimonies')}</NavLink>
        <NavLink to="/fil" className={navClass}>{t('nav.feed')}</NavLink>
        <NavLink to="/communities" className={navClass}>{t('nav.communities')}</NavLink>
        <NavLink to="/campaigns" className={navClass}>{t('nav.campaigns')}</NavLink>
        <NavLink to="/events" className={navClass}>{t('nav.events')}</NavLink>
        <NavLink to="/assistant" className={navClass}>{t('nav.aiWelcome')}</NavLink>
        <NavLink to="/foi" className={navClass}>{t('nav.aiEvangelism')}</NavLink>
        <NavLink to="/world-map" className={navClass}>{t('nav.worldMap')}</NavLink>
        {status === 'authenticated' && (
          <NavLink to="/dashboard" className={navClass}>{t('nav.dashboard')}</NavLink>
        )}
      </div>
      <div className="nav-account">
        <ThemeToggle />
        <LanguageSwitcher />
        <InstallPwaButton />
        {status === 'authenticated' ? (
          <>
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => `nav-admin${isActive ? ' active' : ''}`}>
                <span aria-hidden="true">🛡️</span> {t('nav.admin')}
              </NavLink>
            )}
            <NavLink to="/messages" className={navClass}>
              {t('nav.messages')}
              {unread > 0 && <span className="nav-badge" aria-label={t('messages.unreadCount', { count: unread })}>{unread > 99 ? '99+' : unread}</span>}
            </NavLink>
            <NavLink to="/notifications" className={navClass}>{t('nav.notifications')}</NavLink>
            <button onClick={handleLogout}>{t('nav.logout')}</button>
          </>
        ) : (
          <>
            <NavLink to="/login" className={navClass}>{t('nav.login')}</NavLink>
            <NavLink to="/register" className={navClass}>{t('nav.register')}</NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
