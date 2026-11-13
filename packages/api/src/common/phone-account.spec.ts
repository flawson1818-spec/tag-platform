import { isPhoneAccountEmail, normalizePhone, phoneAccountEmail } from './phone-account';

describe('phone accounts', () => {
  it('normalises the ways people write an international number', () => {
    expect(normalizePhone('+228 90 00 00 00')).toBe('+22890000000');
    expect(normalizePhone('00228-90.00.00.00')).toBe('+22890000000');
    expect(normalizePhone('90000000')).toBeNull(); // no country code
    expect(normalizePhone('+0123')).toBeNull();
  });

  it('gives a phone-only account an address that can never receive mail', () => {
    const email = phoneAccountEmail('+22890000000');
    expect(email).toBe('22890000000@telephone.tour-avant-garde.invalid');
    expect(isPhoneAccountEmail(email)).toBe(true);
    expect(isPhoneAccountEmail('marie@gmail.com')).toBe(false);
  });
});
