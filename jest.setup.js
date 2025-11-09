import '@testing-library/jest-native/extend-expect';

// Ensure React and core primitives are available for mock implementations
import React from 'react';
import { View } from 'react-native';

console.log("Testing file imported successfully.");

// Provide a lightweight router mock for navigation flows
jest.mock('expo-router', () => {
  const routerMock = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  return {
    useRouter: () => routerMock,
    router: routerMock,
    useLocalSearchParams: jest.fn(() => ({})),
    Stack: ({ children }) => <>{children}</>,
    __mocks__: { routerMock },
  };
});

// Camera mocks: grant permissions by default and expose a stub ref API

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const takePictureAsyncMock = jest.fn(async () => ({ uri: 'mock://photo.jpg' }));

  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: takePictureAsyncMock,
      resumePreview: jest.fn(),
      pausePreview: jest.fn(),
    }));
    return <View {...props} />;
  });

  return {
    CameraMode: { picture: 'picture', video: 'video' },
    CameraType: { back: 'back', front: 'front' },
    CameraView,
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
    __mocks__: { takePictureAsyncMock },
  };
});

// Location mocks: permissions granted and watchers that can be manually triggered
jest.mock('expo-location', () => {
  const removeWatcherMock = jest.fn();

  return {
    Accuracy: { High: 'high', Highest: 'highest' },
    requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    watchPositionAsync: jest.fn(async (_options, _callback) => ({
      remove: removeWatcherMock,
    })),
    __mocks__: { removeWatcherMock },
  };
});

// Use the recommended mock for Reanimated to avoid native dependency issues
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');

  // The mock is not a fully fledged animation setup; provide minimal fallbacks
  Reanimated.default.call = () => {};

  return Reanimated;
});

// Expose mocks for easier access in tests
export const testingRouter = require('expo-router').__mocks__.routerMock;
export const testingCamera = require('expo-camera').__mocks__.takePictureAsyncMock;
export const testingLocation = require('expo-location').__mocks__.removeWatcherMock;