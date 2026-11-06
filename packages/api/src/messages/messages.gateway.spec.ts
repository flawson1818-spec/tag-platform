import { MessagesGateway } from './messages.gateway';

function client(token?: string) {
  return { handshake: { query: token ? { token } : {} }, disconnect: vi.fn(), join: vi.fn() };
}

describe('MessagesGateway', () => {
  const tokenService = { verifyAccessToken: vi.fn((t: string) => (t === 'good' ? { sub: 'u1' } : null)) };

  it('only keeps signed-in members, each in their own room', () => {
    const gateway = new MessagesGateway(tokenService as never);
    const anonymous = client();
    const forged = client('bad');
    const member = client('good');
    gateway.handleConnection(anonymous as never);
    gateway.handleConnection(forged as never);
    gateway.handleConnection(member as never);
    expect(anonymous.disconnect).toHaveBeenCalled();
    expect(forged.disconnect).toHaveBeenCalled();
    expect(member.join).toHaveBeenCalledWith('user:u1');
    expect(member.disconnect).not.toHaveBeenCalled();
  });

  it('pushes a message to both members only', () => {
    const gateway = new MessagesGateway(tokenService as never);
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    gateway.server = { to } as never;
    const message = { id: 'm1', conversationId: 'c1', senderId: 'u1', content: 'Shalom', createdAt: 'now' };
    gateway.emitMessage(['u1', 'u2'], message);
    expect(to).toHaveBeenCalledWith(['user:u1', 'user:u2']);
    expect(emit).toHaveBeenCalledWith('dm:message', { message });
  });
});
