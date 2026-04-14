import * as Contacts from 'expo-contacts';

import {
  inferDefaultCountryFromPhone,
  loadNormalizedContactPhoneNumbers,
  normalizePhoneForMatching,
} from '../contactDiscovery';

describe('contactDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('infers the default country from an E.164 phone number', () => {
    expect(inferDefaultCountryFromPhone('+14155552671')).toBe('US');
  });

  it('normalizes local phone numbers into E.164', () => {
    expect(normalizePhoneForMatching('(415) 555-2671', 'US')).toBe('+14155552671');
  });

  it('loads unique normalized contact phone numbers', async () => {
    Contacts.getContactsAsync.mockResolvedValueOnce({
      data: [
        {
          phoneNumbers: [
            { number: '(415) 555-2671' },
            { number: '+1 415 555 2671' },
          ],
        },
        {
          phoneNumbers: [
            { number: '020 7946 0018', countryCode: 'gb' },
            { number: 'not-a-phone' },
          ],
        },
      ],
    });

    await expect(
      loadNormalizedContactPhoneNumbers({ defaultCountry: 'US' })
    ).resolves.toEqual(['+14155552671', '+442079460018']);
  });
});
