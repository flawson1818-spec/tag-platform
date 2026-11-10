import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** The Christian social network's three doors: the feed, churches and groups, the members. */
export function CommunityTabs() {
  const { t } = useTranslation();
  const cls = ({ isActive }: { isActive: boolean }) => `community-tab${isActive ? ' active' : ''}`;
  return (
    <nav className="community-tabs" aria-label={t('community.tabsLabel')}>
      <NavLink to="/communaute" end className={cls}>
        <span aria-hidden="true">📰</span> {t('community.feed')}
      </NavLink>
      <NavLink to="/communaute/groupes" className={cls}>
        <span aria-hidden="true">⛪</span> {t('community.groups')}
      </NavLink>
      <NavLink to="/communaute/membres" className={cls}>
        <span aria-hidden="true">👥</span> {t('community.members')}
      </NavLink>
    </nav>
  );
}
