import { useTranslation } from 'react-i18next';

/** The countries members come from first; anything else is typed with its own "+". */
export const COUNTRY_CODES = [
  { code: '+228', key: 'TG' },
  { code: '+229', key: 'BJ' },
  { code: '+225', key: 'CI' },
  { code: '+233', key: 'GH' },
  { code: '+226', key: 'BF' },
  { code: '+227', key: 'NE' },
  { code: '+223', key: 'ML' },
  { code: '+221', key: 'SN' },
  { code: '+234', key: 'NG' },
  { code: '+237', key: 'CM' },
  { code: '+243', key: 'CD' },
  { code: '+241', key: 'GA' },
  { code: '+33', key: 'FR' },
  { code: '+32', key: 'BE' },
  { code: '+41', key: 'CH' },
  { code: '+1', key: 'US' },
];

/** "+228" + "90 00 00 00" → "+22890000000"; a number typed with its own "+" is kept as is. */
export function fullPhone(country: string, local: string): string {
  const digits = local.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return `${country}${digits.replace(/^0+/, '')}`;
}

/**
 * At login or reset: an identifier that is only digits is a phone number of the default country
 * (Togo); with "+" or "00" it is international; with "@" it is an e-mail.
 */
export function normalizeIdentifier(value: string): string {
  const v = value.trim();
  if (v.includes('@')) return v;
  return fullPhone('+228', v);
}

export function PhoneInput({
  country,
  local,
  onChange,
}: {
  country: string;
  local: string;
  onChange: (country: string, local: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="phone-input">
      <select value={country} onChange={(e) => onChange(e.target.value, local)} aria-label={t('auth.phone.country')}>
        {COUNTRY_CODES.map((c) => (
          <option key={c.code + c.key} value={c.code}>
            {t(`auth.phone.countries.${c.key}`)} ({c.code})
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={t('auth.phone.placeholder')}
        value={local}
        onChange={(e) => onChange(country, e.target.value)}
        aria-label={t('auth.phone.number')}
        required
      />
    </div>
  );
}
