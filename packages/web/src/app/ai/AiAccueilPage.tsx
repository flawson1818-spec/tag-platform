import { aiApi } from '../../lib/api';
import { AiChatWidget } from './AiChatWidget';

export function AiAccueilPage() {
  return (
    <AiChatWidget
      title="🙏 IA Accueil"
      intro="Pose tes questions sur le fonctionnement de TAG — comment rejoindre une salle, soumettre une demande de prière, publier un témoignage…"
      placeholder="Comment rejoindre la salle de prière ?"
      send={aiApi.chatAccueil}
    />
  );
}

export default AiAccueilPage;
