import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCommunityDto } from './create-community.dto';
import { COMMUNITY_TYPES } from '../community.entity';

async function validateDto(payload: Partial<CreateCommunityDto>) {
  const instance = plainToInstance(CreateCommunityDto, payload);
  return validate(instance);
}

describe('CreateCommunityDto', () => {
  it('accepts a minimal valid payload', async () => {
    const errors = await validateDto({ type: COMMUNITY_TYPES[0], name: 'Cellule Soviépé' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a type outside the allowed COMMUNITY_TYPES enum', async () => {
    const errors = await validateDto({ type: 'NOT_A_REAL_TYPE', name: 'x' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejects an empty name', async () => {
    const errors = await validateDto({ type: COMMUNITY_TYPES[0], name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a name over 150 characters', async () => {
    const errors = await validateDto({ type: COMMUNITY_TYPES[0], name: 'x'.repeat(151) });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a malformed parentId (must be a UUID)', async () => {
    const errors = await validateDto({ type: COMMUNITY_TYPES[0], name: 'x', parentId: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'parentId')).toBe(true);
  });

  it('accepts a well-formed parentId', async () => {
    const errors = await validateDto({
      type: COMMUNITY_TYPES[0],
      name: 'x',
      parentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(errors).toHaveLength(0);
  });
});
