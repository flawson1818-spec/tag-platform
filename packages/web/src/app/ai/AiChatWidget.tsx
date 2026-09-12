import { FormEvent, ReactNode, useState } from 'react';
import { AiChatTurn, aiApi } from '../../lib/api';

interface AiChatWidgetProps {
  title: string;
  intro: string;
  placeholder: string;
  send: (message: string, history: AiChatTurn[]) => ReturnType<typeof aiApi.chatAccueil>;
  children?: ReactNode;
}

export function AiChatWidget({ title, intro, placeholder, send, children }: AiChatWidgetProps) {
  const [history, setHistory] = useState<AiChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setError(null);
    setInput('');
    const nextHistory: AiChatTurn[] = [...history, { role: 'user', content: message }];
    setHistory(nextHistory);
    setLoading(true);

    try {
      const res = await send(message, history);
      setHistory([...nextHistory, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-chat">
      <h2>{title}</h2>
      <p className="hint">{intro}</p>
      {children}

      <div className="ai-chat-list">
        {history.length === 0 && <p className="ai-chat-empty">Pose ta première question ci-dessous.</p>}
        {history.map((turn, index) => (
          <div key={index} className={turn.role === 'user' ? 'ai-chat-message ai-chat-user' : 'ai-chat-message ai-chat-assistant'}>
            <strong>{turn.role === 'user' ? 'Toi' : 'IA'}</strong>
            <span>{turn.content}</span>
          </div>
        ))}
        {loading && <div className="ai-chat-message ai-chat-assistant ai-chat-typing">L'assistant réfléchit…</div>}
      </div>

      {error && <p className="error">{error}</p>}

      <form className="ai-chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}

export default AiChatWidget;
