import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';

async function validateDto(payload: Partial<RegisterDto>) {
  const instance = plainToInstance(RegisterDto, payload);
  return validate(instance);
}

describe('RegisterDto', () => {
  const validPayload: RegisterDto = {
    email: 'believer@example.com',
    password: 'Str0ng!Passw0rd',
    displayName: 'Believer',
  };

  it('accepts a well-formed payload', async () => {
    const errors = await validateDto(validPayload);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const errors = await validateDto({ ...validPayload, email: 'not-an-email' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it.each([
    ['too short', 'Sh0rt!x'],
    ['no uppercase', 'nouppercase1!aaaa'],
    ['no lowercase', 'NOLOWERCASE1!AAAA'],
    ['no digit', 'NoDigitsHere!!!!'],
    ['no special char', 'NoSpecialChar1234'],
  ])('rejects a password that is %s', async (_label, password) => {
    const errors = await validateDto({ ...validPayload, password });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('accepts a password right at the 12-character minimum', async () => {
    const errors = await validateDto({ ...validPayload, password: 'Aa1!Aa1!Aa1!' });
    expect(errors.some((e) => e.property === 'password')).toBe(false);
  });

  it('rejects a missing displayName', async () => {
    const errors = await validateDto({ email: validPayload.email, password: validPayload.password });
    expect(errors.some((e) => e.property === 'displayName')).toBe(true);
  });

  it('rejects a displayName over 120 characters', async () => {
    const errors = await validateDto({ ...validPayload, displayName: 'x'.repeat(121) });
    expect(errors.some((e) => e.property === 'displayName')).toBe(true);
  });

  it('allows optional fields to be omitted', async () => {
    const errors = await validateDto(validPayload);
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed optional phone that exceeds max length', async () => {
    const errors = await validateDto({ ...validPayload, phone: '0'.repeat(31) });
    expect(errors.some((e) => e.property === 'phone')).toBe(true);
  });
});
