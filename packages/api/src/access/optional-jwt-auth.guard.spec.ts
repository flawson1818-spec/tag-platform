import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the user when passport resolved one', () => {
    const user = { id: 'user-1', email: 'a@b.com' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns undefined instead of throwing when there is no valid token', () => {
    expect(guard.handleRequest(null, false)).toBeUndefined();
  });

  it('returns undefined even when passport reports an error, rather than blocking the request', () => {
    expect(guard.handleRequest(new Error('jwt malformed'), false)).toBeUndefined();
  });
});
