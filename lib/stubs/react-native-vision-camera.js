// Web stub for react-native-vision-camera.
// Same rationale as react-native-maps.js stub.
import React from 'react';
import { View } from 'react-native';

export const Camera = React.forwardRef(() => React.createElement(View, null));
Camera.getAvailableCameraDevices = () => [];
Camera.getCameraPermissionStatus = () => 'denied';
Camera.requestCameraPermission = async () => 'denied';
Camera.getMicrophonePermissionStatus = () => 'denied';
Camera.requestMicrophonePermission = async () => 'denied';

export function useCameraDevice() { return null; }
export function useCameraPermission() { return { hasPermission: false, requestPermission: async () => false }; }
export function useMicrophonePermission() { return { hasPermission: false, requestPermission: async () => false }; }
export function useCameraFormat() { return undefined; }
export function useFrameProcessor() {}
export function useSkiaFrameProcessor() {}
export const VisionCameraProxy = {};
export const Templates = {};
