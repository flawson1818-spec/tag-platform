import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTestimonyDto } from './create-testimony.dto';

async function validateDto(payload: Partial<CreateTestimonyDto>) {
  const instance = plainToInstance(CreateTestimonyDto, payload);
  return validate(instance);
}

describe('CreateTestimonyDto', () => {
  it('accepts a TEXT testimony with content and no mediaType', async () => {
    const errors = await validateDto({ content: 'Dieu a guéri ma famille' });
    expect(errors).toHaveLength(0);
  });

  it('accepts an empty payload at the DTO layer (content-vs-mediaType cross-check lives in the service)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid mediaType', async () => {
    const errors = await validateDto({ mediaType: 'HOLOGRAM' });
    expect(errors.some((e) => e.property === 'mediaType')).toBe(true);
  });

  it('rejects content over 5000 characters', async () => {
    const errors = await validateDto({ content: 'x'.repeat(5001) });
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejects a malformed fileId', async () => {
    const errors = await validateDto({ mediaType: 'AUDIO', fileId: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'fileId')).toBe(true);
  });

  it('accepts a well-formed fileId', async () => {
    const errors = await validateDto({
      mediaType: 'AUDIO',
      fileId: '11111111-1111-4111-8111-111111111111',
    });
    expect(errors).toHaveLength(0);
  });
});
