import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const QUICK_LINKS = [
  { to: '/room', label: 'Salle de prière', description: 'Rejoindre la prière en direct' },
  { to: '/prayer-requests', label: 'Demandes de prière', description: 'Déposer ou consulter une demande' },
  { to: '/testimonies', label: 'Témoignages', description: 'Partager ou modérer un témoignage' },
  { to: '/communities', label: 'Communautés', description: 'Rejoindre une cellule, une équipe, une église' },
  { to: '/world-map', label: 'Carte mondiale', description: 'Voir la prière se vivre à travers le monde' },
];

const MANAGEMENT_LINKS = [
  { to: '/programs', label: 'Programmes de prière', description: 'Créer et planifier les créneaux' },
  { to: '/room/moderate', label: 'Gérer les intercesseurs', description: 'Assigner un animateur à chaque section' },
  { to: '/social-publications', label: 'Brouillons réseaux sociaux', description: 'Valider les publications générées' },
  { to: '/admin/moderation', label: 'Contenus signalés', description: 'Témoignages et demandes signalés par l\'IA Modératrice' },
  { to: '/admin/users', label: 'Utilisateurs & rôles', description: 'Statut des comptes, attribution des rôles' },
  { to: '/admin/analytics', label: 'Tableau de bord', description: 'Croissance, fréquentation, rétention, export' },
  { to: '/admin/system', label: 'Système', description: 'Santé, sauvegardes, journaux d\'audit' },
];

const SECURITY_LINKS = [
  {
    to: '/security/mfa',
    label: 'Vérification en deux étapes',
    description: 'Protéger le compte avec un code à usage unique',
  },
  { to: '/profile', label: 'Mon profil', description: 'Nom, téléphone, langue, fuseau horaire' },
];

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="dashboard-page">
      <h2>Bienvenue, {user.display_name}</h2>
      {!user.email_verified_at && (
        <p className="hint">
          Adresse e-mail non vérifiée — <Link to="/onboarding">vérifie-la</Link>.
        </p>
      )}
      <dl className="user-summary">
        <dt>E-mail</dt>
        <dd>{user.email}</dd>
        <dt>Statut</dt>
        <dd>{user.status}</dd>
        <dt>Langue</dt>
        <dd>{user.locale}</dd>
        <dt>Fuseau horaire</dt>
        <dd>{user.timezone}</dd>
        <dt>Vérification en deux étapes</dt>
        <dd>{user.mfa_enabled ? 'Activée' : 'Désactivée'}</dd>
      </dl>

      <h3>Accès rapide</h3>
      <div className="quick-links">
        {QUICK_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-link-card">
            <strong>{link.label}</strong>
            <span>{link.description}</span>
          </Link>
        ))}
      </div>

      <h3>Gestion</h3>
      <p className="hint">
        Accessible selon ton rôle — un accès refusé ici signifie simplement que ton compte n'a pas
        encore la permission requise.
      </p>
      <div className="quick-links">
        {MANAGEMENT_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-link-card quick-link-card-muted">
            <strong>{link.label}</strong>
            <span>{link.description}</span>
          </Link>
        ))}
      </div>

      <h3>Sécurité</h3>
      <div className="quick-links">
        {SECURITY_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-link-card quick-link-card-muted">
            <strong>{link.label}</strong>
            <span>{link.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default DashboardPage;
