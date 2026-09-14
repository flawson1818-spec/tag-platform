import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'active' : '';
}

export function HeaderNav() {
  const { status, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        <NavLink to="/communities" className={navClass}>{t('nav.communities')}</NavLink>
        <NavLink to="/campaigns" className={navClass}>{t('nav.campaigns')}</NavLink>
        <NavLink to="/events" className={navClass}>{t('nav.events')}</NavLink>
        <NavLink to="/assistant" className={navClass}>{t('nav.aiWelcome')}</NavLink>
        <NavLink to="/foi" className={navClass}>{t('nav.aiEvangelism')}</NavLink>
        <NavLink to="/world-map" className={navClass}>{t('nav.worldMap')}</NavLink>
      </div>
      <div className="nav-account">
        <ThemeToggle />
        <LanguageSwitcher />
        {status === 'authenticated' ? (
          <>
            <NavLink to="/notifications" className={navClass}>{t('nav.notifications')}</NavLink>
            <NavLink to="/dashboard" className={navClass}>{t('nav.dashboard')}</NavLink>
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
