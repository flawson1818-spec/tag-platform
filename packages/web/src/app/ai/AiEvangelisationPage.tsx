import { aiApi } from '../../lib/api';
import { AiChatWidget } from './AiChatWidget';

export function AiEvangelisationPage() {
  return (
    <AiChatWidget
      title="✝️ IA Évangélisation"
      intro="Discute de questions de foi, pose des questions bibliques, ou demande à découvrir l'Évangile."
      placeholder="Qui était Jésus ?"
      send={aiApi.chatEvangelisation}
    />
  );
}

export default AiEvangelisationPage;
