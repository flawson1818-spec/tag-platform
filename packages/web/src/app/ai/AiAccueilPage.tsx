import { useTranslation } from 'react-i18next';
import { aiApi } from '../../lib/api';
import { AiChatWidget } from './AiChatWidget';

export function AiAccueilPage() {
  const { t } = useTranslation();
  return (
    <AiChatWidget
      title={t('aiWelcome.title')}
      intro={t('aiWelcome.intro')}
      placeholder={t('aiWelcome.placeholder')}
      send={aiApi.chatAccueil}
    />
  );
}

export default AiAccueilPage;
