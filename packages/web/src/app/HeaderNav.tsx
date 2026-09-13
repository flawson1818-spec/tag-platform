import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'active' : '';
}

export function HeaderNav() {
  const { status, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav>
      <div className="nav-primary">
        <NavLink to="/" end className={navClass}>Accueil</NavLink>
        <NavLink to="/room" className={navClass}>Salle de prière</NavLink>
        <NavLink to="/prayer-requests" className={navClass}>Demandes de prière</NavLink>
        <NavLink to="/testimonies" className={navClass}>Témoignages</NavLink>
        <NavLink to="/communities" className={navClass}>Communautés</NavLink>
        <NavLink to="/campaigns" className={navClass}>Campagnes</NavLink>
        <NavLink to="/events" className={navClass}>Événements</NavLink>
        <NavLink to="/assistant" className={navClass}>IA Accueil</NavLink>
        <NavLink to="/foi" className={navClass}>IA Évangélisation</NavLink>
        <NavLink to="/world-map" className={navClass}>Carte mondiale</NavLink>
      </div>
      <div className="nav-account">
        <ThemeToggle />
        {status === 'authenticated' ? (
          <>
            <NavLink to="/notifications" className={navClass}>Notifications</NavLink>
            <NavLink to="/dashboard" className={navClass}>Tableau de bord</NavLink>
            <button onClick={handleLogout}>Se déconnecter</button>
          </>
        ) : (
          <>
            <NavLink to="/login" className={navClass}>Connexion</NavLink>
            <NavLink to="/register" className={navClass}>Créer un compte</NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
