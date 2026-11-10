import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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

interface Item {
  to: string;
  key: string;
  icon: string;
}

/** What a signed-in member uses every day — the rest waits behind "Plus". */
const MEMBER_MAIN: Item[] = [
  { to: '/', key: 'home', icon: '🏠' },
  { to: '/room', key: 'room', icon: '🕯️' },
  { to: '/communaute', key: 'community', icon: '👥' },
  { to: '/prayer-requests', key: 'askPrayer', icon: '🙏' },
];

/** "Communauté" stays lit on the feed, the groups, the members and any profile or church page. */
const COMMUNITY_PATHS = ['/communaute', '/membres/', '/communities'];
function isCommunity(pathname: string): boolean {
  return COMMUNITY_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`));
}
const MEMBER_MORE: Item[] = [
  { to: '/testimonies', key: 'testimonies', icon: '✨' },
  { to: '/events', key: 'events', icon: '📅' },
  { to: '/campaigns', key: 'campaigns', icon: '🎯' },
  { to: '/world-map', key: 'worldMap', icon: '🌍' },
  { to: '/assistant', key: 'aiWelcome', icon: '💬' },
  { to: '/foi', key: 'aiEvangelism', icon: '📖' },
];
/** A visitor discovers the watch: the room, the requests, the world map. */
const VISITOR_MAIN: Item[] = [
  { to: '/', key: 'home', icon: '🏠' },
  { to: '/room', key: 'room', icon: '🕯️' },
  { to: '/prayer-requests', key: 'askPrayer', icon: '🙏' },
  { to: '/world-map', key: 'worldMap', icon: '🌍' },
];
const VISITOR_MORE: Item[] = [
  { to: '/events', key: 'events', icon: '📅' },
  { to: '/campaigns', key: 'campaigns', icon: '🎯' },
  { to: '/assistant', key: 'aiWelcome', icon: '💬' },
  { to: '/foi', key: 'aiEvangelism', icon: '📖' },
];

/** A button that opens a small panel; closes on outside click, Escape, or navigation. */
function Dropdown({
  label,
  className,
  children,
  align = 'left',
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState(location.key);
  // Following a link inside the panel closes it.
  if (open && openedAt !== location.key) {
    setOpen(false);
    setOpenedAt(location.key);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`nav-dropdown ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        className="nav-dropdown-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpenedAt(location.key);
          setOpen((o) => !o);
        }}
      >
        {label}
      </button>
      {open && <div className={`nav-dropdown-panel align-${align}`}>{children}</div>}
    </div>
  );
}

export function HeaderNav() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const signedIn = status === 'authenticated';
  const unread = useUnreadMessages(signedIn);
  const { canAny } = useAccess();
  const isAdmin = signedIn && canAny(ADMIN_PERMISSIONS);
  const main = signedIn ? MEMBER_MAIN : VISITOR_MAIN;
  const more = signedIn ? MEMBER_MORE : VISITOR_MORE;
  const initial = (user?.display_name ?? '?').trim().charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const badge = unread > 0 && (
    <span className="nav-badge" aria-label={t('messages.unreadCount', { count: unread })}>
      {unread > 99 ? '99+' : unread}
    </span>
  );

  return (
      <nav aria-label={t('nav.mainLabel')} className={signedIn ? 'signed-in' : undefined}>
        <div className="nav-primary">
          {main.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive || (item.to === '/communaute' && isCommunity(location.pathname)) ? 'active' : ''
              }
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
          <Dropdown label={<>{t('nav.more')} ▾</>} className="nav-more">
            {more.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                <span aria-hidden="true">{item.icon}</span> {t(`nav.${item.key}`)}
              </NavLink>
            ))}
          </Dropdown>
        </div>

        <div className="nav-account">
          {signedIn ? (
            <>
              {isAdmin && (
                <NavLink to="/admin" className={({ isActive }) => `nav-admin${isActive ? ' active' : ''}`}>
                  <span aria-hidden="true">🛡️</span> <span className="nav-admin-label">{t('nav.admin')}</span>
                </NavLink>
              )}
              <NavLink to="/messages" className={({ isActive }) => `nav-icon${isActive ? ' active' : ''}`} title={t('nav.messages')}>
                <span aria-hidden="true">✉️</span>
                <span className="sr-only">{t('nav.messages')}</span>
                {badge}
              </NavLink>
              <NavLink to="/notifications" className={({ isActive }) => `nav-icon${isActive ? ' active' : ''}`} title={t('nav.notifications')}>
                <span aria-hidden="true">🔔</span>
                <span className="sr-only">{t('nav.notifications')}</span>
              </NavLink>
              <Dropdown
                align="right"
                className="nav-me"
                label={
                  <>
                    <span className="nav-avatar" aria-hidden="true">
                      {initial}
                    </span>
                    <span className="sr-only">{t('nav.myMenu')}</span>
                  </>
                }
              >
                <p className="nav-me-name">{user?.display_name}</p>
                {user && (
                  <NavLink to={`/membres/${user.id}`} className={navClass}>
                    <span aria-hidden="true">👤</span> {t('nav.myProfile')}
                  </NavLink>
                )}
                <NavLink to="/dashboard" className={navClass}>
                  <span aria-hidden="true">🧭</span> {t('nav.dashboard')}
                </NavLink>
                <NavLink to="/profile" className={navClass}>
                  <span aria-hidden="true">⚙️</span> {t('nav.settings')}
                </NavLink>
                <div className="nav-me-row">
                  <LanguageSwitcher />
                  <ThemeToggle />
                </div>
                <InstallPwaButton />
                <button type="button" className="nav-logout" onClick={handleLogout}>
                  {t('nav.logout')}
                </button>
              </Dropdown>
            </>
          ) : (
            <>
              <LanguageSwitcher />
              <ThemeToggle />
              <InstallPwaButton />
              <NavLink to="/login" className={navClass}>
                {t('nav.login')}
              </NavLink>
              <NavLink to="/register" className="nav-cta">
                {t('nav.register')}
              </NavLink>
            </>
          )}
        </div>
      </nav>
  );
}

/** On phones, the everyday places at the thumb — like an app. Signed-in members only. */
export function MemberTabBar() {
  const { status } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const unread = useUnreadMessages(status === 'authenticated');
  if (status !== 'authenticated') return null;
  return (
    <nav className="tabbar" aria-label={t('nav.tabbarLabel')}>
      <NavLink to="/" end className={navClass}>
        <span aria-hidden="true">🏠</span>
        {t('nav.home')}
      </NavLink>
      <NavLink to="/room" className={navClass}>
        <span aria-hidden="true">🕯️</span>
        {t('nav.prayerShort')}
      </NavLink>
      <NavLink to="/communaute" className={({ isActive }) => (isActive || isCommunity(location.pathname) ? 'active' : '')}>
        <span aria-hidden="true">👥</span>
        {t('nav.communityShort')}
      </NavLink>
      <NavLink to="/prayer-requests" className={navClass}>
        <span aria-hidden="true">🙏</span>
        {t('nav.requestsShort')}
      </NavLink>
      <NavLink to="/messages" className={navClass}>
        <span aria-hidden="true" className="tabbar-icon">
          ✉️{unread > 0 && <span className="nav-badge">{unread > 9 ? '9+' : unread}</span>}
        </span>
        {t('nav.messages')}
      </NavLink>
    </nav>
  );
}
