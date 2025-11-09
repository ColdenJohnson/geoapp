const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');

const loadEnvFile = (filename) => {
  const envPath = path.resolve(__dirname, filename);
  if (fs.existsSync(envPath)) {
    dotenvExpand.expand(dotenv.config({ path: envPath, override: true }));
  }
};

// Load base .env first, then allow .env.local to override
loadEnvFile('.env');
loadEnvFile('.env.local');

const appJson = require('./app.json');

module.exports = () => {
  const baseExpoConfig = appJson.expo || {};
  const extra = baseExpoConfig.extra || {};

  const resolvedBaseUrl =
    process.env.EXPO_PUBLIC_BASE_URL ||
    extra.EXPO_PUBLIC_BASE_URL ||
    extra.apiBaseUrl ||
    'https://geode-backend-834952308922.us-central1.run.app';

  return {
    expo: {
      ...baseExpoConfig,
      extra: {
        ...extra,
        EXPO_PUBLIC_BASE_URL: resolvedBaseUrl,
        apiBaseUrl: resolvedBaseUrl,
      },
    },
  };
};
