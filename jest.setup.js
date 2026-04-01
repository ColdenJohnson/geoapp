import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

import '@testing-library/jest-native/extend-expect';

// Ensure React and core primitives are available for mock implementations
import React from 'react';
import { View } from 'react-native';

// Provide a lightweight router mock for navigation flows
jest.mock('expo-router', () => {
  const routerMock = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  };

  return {
    useRouter: () => routerMock,
    useRootNavigationState: jest.fn(() => ({ key: 'mock-root' })),
    router: routerMock,
    useLocalSearchParams: jest.fn(() => ({})),
    Stack: ({ children }) => <>{children}</>,
    __mocks__: { routerMock },
  };
});

// Lightweight image mock to avoid native module errors
jest.mock('expo-image', () => {
  const { Image } = require('react-native');
  return { Image };
});

// Mock vector icons to avoid font loading
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Icon = ({ name }) => <View><Text>{name}</Text></View>;
  return { FontAwesome6: Icon, MaterialIcons: Icon };
});

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return ({ name }) => <View><Text>{name}</Text></View>;
});

jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return ({ name }) => <View><Text>{name}</Text></View>;
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

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const takePhotoMock = jest.fn(async () => ({
    path: 'mock://photo.jpg',
    width: 1200,
    height: 1600,
    isRawPhoto: false,
    orientation: 'portrait',
    isMirrored: false,
  }));
  const useCameraFormatMock = jest.fn((device) => device?.formats?.[0]);
  let lastCameraProps = null;
  const mockFormat = {
    photoWidth: 1200,
    photoHeight: 1600,
    videoWidth: 1200,
    videoHeight: 1600,
    minFps: 30,
    maxFps: 30,
    minISO: 25,
    maxISO: 800,
    fieldOfView: 60,
    maxZoom: 8,
    autoFocusSystem: 'contrast-detection',
    videoStabilizationModes: [],
    supportsPhotoHdr: false,
    supportsVideoHdr: false,
    supportsDepthCapture: false,
    supportsVideoSnapshot: true,
    pixelFormats: ['yuv'],
  };

  const devices = {
    back: {
      id: 'mock-back-camera',
      position: 'back',
      name: 'Mock Back Camera',
      physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera'],
      hasFlash: true,
      hasTorch: true,
      minFocusDistance: 0,
      isMultiCam: true,
      minZoom: 0.5,
      maxZoom: 8,
      neutralZoom: 1,
      minExposure: 0,
      maxExposure: 0,
      formats: [mockFormat],
      supportsLowLightBoost: false,
    },
    front: {
      id: 'mock-front-camera',
      position: 'front',
      name: 'Mock Front Camera',
      physicalDevices: ['wide-angle-camera'],
      hasFlash: false,
      hasTorch: false,
      minFocusDistance: 0,
      isMultiCam: false,
      minZoom: 1,
      maxZoom: 4,
      neutralZoom: 1,
      minExposure: 0,
      maxExposure: 0,
      formats: [mockFormat],
      supportsLowLightBoost: false,
    },
  };

  const Camera = React.forwardRef((props, ref) => {
    lastCameraProps = props;
    React.useEffect(() => {
      props.onInitialized?.();
    }, [props]);

    React.useImperativeHandle(ref, () => ({
      takePhoto: takePhotoMock,
    }));
    return <View {...props} />;
  });

  Camera.getCameraPermissionStatus = jest.fn(() => 'granted');
  Camera.requestCameraPermission = jest.fn(async () => 'granted');

  return {
    Camera,
    useCameraPermission: jest.fn(() => ({ hasPermission: true, requestPermission: jest.fn(async () => true) })),
    useCameraDevice: jest.fn((position) => (position === 'front' ? devices.front : devices.back)),
    useCameraFormat: useCameraFormatMock,
    __mocks__: {
      takePhotoMock,
      devices,
      mockFormat,
      useCameraFormatMock,
      getLastCameraProps: () => lastCameraProps,
    },
  };
});

// Location mocks: permissions granted and watchers that can be manually triggered
jest.mock('expo-location', () => {
  const removeWatcherMock = jest.fn();

  return {
    Accuracy: { High: 'high', Highest: 'highest' },
    requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getLastKnownPositionAsync: jest.fn(async () => null),
    getCurrentPositionAsync: jest.fn(async () => null),
    watchPositionAsync: jest.fn(async (_options, _callback) => ({
      remove: removeWatcherMock,
    })),
    __mocks__: { removeWatcherMock },
  };
});

// Notifications mock: prevent native calls while exposing listeners for assertions
jest.mock('expo-notifications', () => {
  const receivedListeners = [];
  const responseListeners = [];

  return {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExpoPushToken-mock' })),
    setNotificationChannelAsync: jest.fn(async () => {}),
    getLastNotificationResponseAsync: jest.fn(async () => null),
    addNotificationReceivedListener: jest.fn((cb) => {
      receivedListeners.push(cb);
      return { remove: jest.fn() };
    }),
    addNotificationResponseReceivedListener: jest.fn((cb) => {
      responseListeners.push(cb);
      return { remove: jest.fn() };
    }),
    scheduleNotificationAsync: jest.fn(async () => ({ id: 'local-debug-id' })),
    AndroidImportance: { MAX: 'max' },
    __mocks__: { receivedListeners, responseListeners },
  };
});

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'mock-project-id' } } },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }) => <>{children}</>,
    SafeAreaView: ({ children }) => <>{children}</>,
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
