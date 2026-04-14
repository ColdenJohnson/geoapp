import * as Contacts from 'expo-contacts';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

function normalizeCountryCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed || null;
}

export function inferDefaultCountryFromPhone(phoneNumber) {
  if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    return null;
  }

  try {
    const parsed = parsePhoneNumberFromString(phoneNumber);
    return parsed?.country || null;
  } catch (error) {
    return null;
  }
}

export function normalizePhoneForMatching(value, defaultCountry) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = defaultCountry
      ? parsePhoneNumberFromString(trimmed, defaultCountry)
      : parsePhoneNumberFromString(trimmed);
    if (!parsed?.isValid()) {
      return null;
    }
    return parsed.number;
  } catch (error) {
    return null;
  }
}

export async function getContactsPermissionStatus() {
  const permission = await Contacts.getPermissionsAsync();
  return permission?.status || 'undetermined';
}

export async function requestContactsPermission() {
  const permission = await Contacts.requestPermissionsAsync();
  return permission?.status || 'undetermined';
}

export async function loadNormalizedContactPhoneNumbers({ defaultCountry } = {}) {
  const result = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });
  const contacts = Array.isArray(result?.data) ? result.data : [];
  const normalizedNumbers = new Set();

  for (const contact of contacts) {
    const phoneEntries = Array.isArray(contact?.phoneNumbers) ? contact.phoneNumbers : [];
    for (const entry of phoneEntries) {
      const entryCountry = normalizeCountryCode(entry?.countryCode) || normalizeCountryCode(defaultCountry);
      const rawValue = typeof entry?.number === 'string'
        ? entry.number
        : typeof entry?.digits === 'string'
          ? entry.digits
          : '';
      const normalized = normalizePhoneForMatching(rawValue, entryCountry);
      if (normalized) {
        normalizedNumbers.add(normalized);
      }
    }
  }

  return Array.from(normalizedNumbers);
}
