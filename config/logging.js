import { LogBox } from 'react-native';

const IGNORE_PATTERNS = [
  'This method is deprecated (as well as all React Native Firebase namespaced API)',
];

LogBox.ignoreLogs(IGNORE_PATTERNS);

const originalWarn = console.warn;
console.warn = (...args) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (IGNORE_PATTERNS.some((pattern) => first.includes(pattern))) {
    return;
  }
  originalWarn(...args);
};
