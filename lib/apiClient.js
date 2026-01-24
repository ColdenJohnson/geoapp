import axios from 'axios';
import auth from '@react-native-firebase/auth';
import Constants from 'expo-constants';

// Resolve base URL with env first, then app.json extra, then a safe default
export const PUBLIC_BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL || // Because of dotenv in app.config.js this will most likely be defined
  (Constants?.expoConfig?.extra &&
    (Constants.expoConfig.extra.EXPO_PUBLIC_BASE_URL || Constants.expoConfig.extra.apiBaseUrl)) ||
  'https://geode-backend-834952308922.us-central1.run.app';

/**
 * Fetch a fresh ID token for the currently signed-in Firebase user.
 * Firebase rotates tokens, so we await getIdToken() per request to ensure headers stay valid.
 */
async function getAuthHeader() {
  const user = auth().currentUser;
  if (user) {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

/**
 * Merge Authorization headers with any caller-provided config without clobbering other header values.
 */
function mergeConfig(headers, config = {}) {
  if (!config.headers) {
    return { ...config, headers };
  }
  return { ...config, headers: { ...config.headers, ...headers } };
}

export async function apiGet(path, config) {
  const headers = await getAuthHeader();
  return axios.get(`${PUBLIC_BASE_URL}${path}`, mergeConfig(headers, config));
}

export async function apiPost(path, data, config) {
  const headers = await getAuthHeader();
  return axios.post(`${PUBLIC_BASE_URL}${path}`, data, mergeConfig(headers, config));
}

export async function apiPatch(path, data, config) {
  const headers = await getAuthHeader();
  return axios.patch(`${PUBLIC_BASE_URL}${path}`, data, mergeConfig(headers, config));
}

export async function apiDelete(path, config) {
  const headers = await getAuthHeader();
  return axios.delete(`${PUBLIC_BASE_URL}${path}`, mergeConfig(headers, config));
}
