import { GroupLiveGateway } from './group-live.gateway';
import { parseLiveVideo } from './group-live';

describe('parseLiveVideo', () => {
  it('shows YouTube and Facebook lives in the page, opens other calls in a new tab', () => {
    expect(parseLiveVideo('https://www.youtube.com/live/abcdefghijk')?.embedUrl).toBe('https://www.youtube.com/embed/abcdefghijk?autoplay=1');
    expect(parseLiveVideo('https://www.facebook.com/eglise/videos/123')?.embedUrl).toContain('facebook.com/plugins/video.php');
    expect(parseLiveVideo('https://meet.google.com/abc-defg-hij')).toEqual({ joinUrl: 'https://meet.google.com/abc-defg-hij', link: 'https://meet.google.com/abc-defg-hij' });
    expect(parseLiveVideo('javascript:alert(1)')).toBeNull();
    expect(parseLiveVideo('http://insecure.example')).toBeNull();
  });
});

describe('GroupLiveGateway', () => {
  const C = '11111111-1111-1111-1111-111111111111';
  function build(opts: { status?: string; canHost?: boolean } = {}) {
    const emitted: { room: string; event: string; data: unknown }[] = [];
    const server = { to: (room: string) => ({ emit: (event: string, data: unknown) => emitted.push({ room, event, data }) }) };
    const notifications = { create: vi.fn() };
    const gateway = new GroupLiveGateway(
      { verifyAccessToken: () => ({ sub: 'u1' }) } as never,
      { getUserPermissionCodes: vi.fn().mockResolvedValue(new Set(opts.canHost ? ['community.manage'] : [])) } as never,
      {
        getMembershipStatus: vi.fn().mockResolvedValue(opts.status ?? 'ACTIVE'),
        listMembers: vi.fn().mockResolvedValue({ data: [{ user_id: 'u1' }, { user_id: 'u2' }] }),
      } as never,
      notifications as never,
      { client: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Paul' } }) }) }) }) } } as never,
    );
    (gateway as unknown as { server: unknown }).server = server;
    const client = { id: 's1', handshake: { query: { token: 't' } }, emit: vi.fn(), join: vi.fn(), disconnect: vi.fn() };
    return { gateway, client, emitted, notifications };
  }

  it('lets a leader start a live session, and tells the members', async () => {
    const { gateway, client, emitted, notifications } = build({ canHost: true });
    await gateway.start(client as never, { communityId: C, title: 'Formation des cellules', kind: 'TRAINING', videoUrl: 'https://youtu.be/abcdefghijk' });
    expect(gateway.getSession(C)).toMatchObject({ title: 'Formation des cellules', kind: 'TRAINING', host: { name: 'Paul' } });
    expect(emitted.some((e) => e.event === 'live:session')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(notifications.create).toHaveBeenCalledWith('u2', 'GROUP_LIVE_STARTED', expect.objectContaining({ communityId: C }));
    expect(notifications.create).not.toHaveBeenCalledWith('u1', expect.anything(), expect.anything());
  });

  it('refuses hosting to a simple member, and the room to a non-member', async () => {
    const member = build();
    await member.gateway.start(member.client as never, { communityId: C, title: 'X' });
    expect(member.gateway.getSession(C)).toBeNull();
    expect(member.client.emit).toHaveBeenCalledWith('live:error', expect.anything());

    const outsider = build({ status: 'NONE' });
    await outsider.gateway.join(outsider.client as never, { communityId: C });
    expect(outsider.client.join).not.toHaveBeenCalled();
  });

  it('carries the chat and the worship music to everyone in the room', async () => {
    const { gateway, client, emitted } = build({ canHost: true });
    await gateway.start(client as never, { communityId: C, title: 'Louange', kind: 'WORSHIP' });
    await gateway.music(client as never, { communityId: C, link: 'https://open.spotify.com/playlist/37i9dQZF1DXcb6CQIjdqKy' });
    expect(gateway.getSession(C)?.music?.provider).toBe('spotify');
    await gateway.chat(client as never, { communityId: C, text: 'Amen !' });
    expect(emitted.find((e) => e.event === 'live:chat')?.data).toMatchObject({ message: { text: 'Amen !' } });
  });
});
