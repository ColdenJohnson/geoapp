import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { FontAwesome6, MaterialIcons } from '@expo/vector-icons';
import { VolumeManager } from 'react-native-volume-manager';

import { usePalette } from '@/hooks/usePalette';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const PHOTO_ASPECT_RATIO = 3 / 4;
const NATIVE_PHOTO_ASPECT_RATIO = 1 / PHOTO_ASPECT_RATIO;
const DEFAULT_LENS = '1x';
const HALF_LENS = '0.5x';
const TIMER_OPTIONS = [0, 3, 10];
const PHOTO_FORMAT_FILTERS = [
  { photoAspectRatio: NATIVE_PHOTO_ASPECT_RATIO },
  { photoResolution: 'max' },
  { videoResolution: 'max' },
];

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function ensureFileUri(path) {
  if (typeof path !== 'string' || !path) {
    return null;
  }
  return path.startsWith('file://') ? path : `file://${path}`;
}

function formatTimerLabel(seconds) {
  return seconds === 0 ? 'OFF' : `${seconds}S`;
}

export default function ChallengeCameraStage({
  promptText = '',
  helperText,
  onPhotoCaptured,
  disabled = false,
}) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cameraRef = useRef(null);
  const lastVolumeTriggerAtRef = useRef(0);
  const preferredBackDevice = useCameraDevice('back', {
    physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera'],
  });
  const fallbackBackDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const [cameraPosition, setCameraPosition] = useState('back');
  const [lensPreset, setLensPreset] = useState(DEFAULT_LENS);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerExpanded, setIsTimerExpanded] = useState(false);
  const [countdownValue, setCountdownValue] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const backDevice = preferredBackDevice || fallbackBackDevice;
  const activeDevice = cameraPosition === 'back' ? backDevice : frontDevice;
  const cameraFormat = useCameraFormat(activeDevice, PHOTO_FORMAT_FILTERS);

  const supportsHalfZoom = useMemo(() => (
    cameraPosition === 'back' &&
    !!activeDevice &&
    Array.isArray(activeDevice.physicalDevices) &&
    activeDevice.physicalDevices.includes('ultra-wide-angle-camera') &&
    Number(activeDevice.minZoom) < Number(activeDevice.neutralZoom)
  ), [activeDevice, cameraPosition]);

  const zoomValues = useMemo(() => {
    if (!activeDevice) {
      return { half: 1, normal: 1 };
    }

    const minZoom = Number.isFinite(activeDevice.minZoom) ? activeDevice.minZoom : 1;
    const maxZoom = Number.isFinite(activeDevice.maxZoom) ? activeDevice.maxZoom : 1;
    const normalZoom = clamp(
      Number.isFinite(activeDevice.neutralZoom) ? activeDevice.neutralZoom : 1,
      minZoom,
      maxZoom
    );

    return {
      half: clamp(minZoom, minZoom, normalZoom),
      normal: normalZoom,
    };
  }, [activeDevice]);

  const selectedZoom = lensPreset === HALF_LENS && supportsHalfZoom
    ? zoomValues.half
    : zoomValues.normal;
  const currentLensLabel = lensPreset === HALF_LENS && supportsHalfZoom ? HALF_LENS : DEFAULT_LENS;
  const timerIconName = timerSeconds === 0 ? 'timer-off' : 'timer';

  const shutterDisabled = disabled || isCapturing || countdownValue !== null || !activeDevice || !isCameraReady;
  const secondaryControlsDisabled = disabled || isCapturing || countdownValue !== null || !activeDevice;

  useEffect(() => {
    setIsCameraReady(false);
    setCameraError('');
  }, [activeDevice?.id]);

  useEffect(() => {
    setLensPreset(DEFAULT_LENS);
  }, [cameraPosition]);

  useEffect(() => {
    if (!supportsHalfZoom && lensPreset === HALF_LENS) {
      setLensPreset(DEFAULT_LENS);
    }
  }, [lensPreset, supportsHalfZoom]);

  useEffect(() => {
    if (!activeDevice?.hasFlash && flashEnabled) {
      setFlashEnabled(false);
    }
  }, [activeDevice?.hasFlash, flashEnabled]);

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || !activeDevice || disabled || isCapturing) {
      return;
    }

    setIsCapturing(true);
    setCameraError('');

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: activeDevice.hasFlash && flashEnabled ? 'on' : 'off',
        enableShutterSound: true,
      });
      const uri = ensureFileUri(photo?.path);
      if (uri) {
        onPhotoCaptured(uri);
      }
    } catch (error) {
      console.error('Failed to capture photo', error);
      setCameraError('Could not capture photo. Try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [activeDevice, disabled, flashEnabled, isCapturing, onPhotoCaptured]);

  useEffect(() => {
    if (countdownValue === null) {
      return undefined;
    }

    if (countdownValue === 0) {
      setCountdownValue(null);
      void capturePhoto();
      return undefined;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setCountdownValue((current) => (current === null ? null : current - 1));
    }, 1000);

    return () => globalThis.clearTimeout(timeoutId);
  }, [capturePhoto, countdownValue]);

  const handleShutterPress = useCallback(() => {
    if (shutterDisabled) {
      return;
    }

    if (timerSeconds > 0) {
      setCountdownValue(timerSeconds);
      return;
    }

    void capturePhoto();
  }, [capturePhoto, shutterDisabled, timerSeconds]);

  const handleFlipPress = useCallback(() => {
    if (secondaryControlsDisabled) {
      return;
    }

    setCameraPosition((current) => (current === 'back' ? 'front' : 'back'));
  }, [secondaryControlsDisabled]);

  const handleLensToggle = useCallback(() => {
    if (secondaryControlsDisabled || !supportsHalfZoom) {
      return;
    }

    setLensPreset((current) => (current === HALF_LENS ? DEFAULT_LENS : HALF_LENS));
  }, [secondaryControlsDisabled, supportsHalfZoom]);

  const cameraStatusText = cameraError || (!activeDevice ? 'Preparing camera...' : null);

  useEffect(() => {
    const subscription = VolumeManager.addVolumeListener(() => {
      const now = Date.now();
      if (now - lastVolumeTriggerAtRef.current < 450) {
        return;
      }

      lastVolumeTriggerAtRef.current = now;
      handleShutterPress();
    });

    void VolumeManager.showNativeVolumeUI({ enabled: false });

    return () => {
      subscription?.remove?.();
      void VolumeManager.showNativeVolumeUI({ enabled: true });
    };
  }, [handleShutterPress]);

  return (
    <View style={styles.stage}>
      {promptText ? (
        <Text style={styles.promptText} numberOfLines={2}>
          {promptText}
        </Text>
      ) : null}

      <View style={styles.cameraContainer}>
        {activeDevice ? (
          <Camera
            ref={cameraRef}
            style={styles.camera}
            device={activeDevice}
            format={cameraFormat}
            isActive
            photo
            zoom={selectedZoom}
            enableZoomGesture={false}
            onInitialized={() => setIsCameraReady(true)}
            onError={(error) => {
              console.error('Camera preview error', error);
              setCameraError('Camera unavailable right now.');
            }}
          />
        ) : (
          <View style={styles.cameraFallback} />
        )}

        {cameraStatusText ? (
          <View style={styles.cameraStatus}>
            <Text style={styles.cameraStatusText}>{cameraStatusText}</Text>
          </View>
        ) : null}

        {countdownValue !== null && countdownValue > 0 ? (
          <View style={styles.countdownOverlay} pointerEvents="none">
            <Text style={styles.countdownText}>{countdownValue}</Text>
          </View>
        ) : null}

        <View style={styles.cameraControlsOverlay} pointerEvents="box-none">
          <View style={styles.topControls}>
            <Pressable
              testID="camera-flash-toggle"
              onPress={() => setFlashEnabled((current) => !current)}
              disabled={secondaryControlsDisabled || !activeDevice?.hasFlash}
              style={({ pressed }) => [
                styles.topControlButton,
                flashEnabled && styles.topControlButtonActive,
                (!activeDevice?.hasFlash || secondaryControlsDisabled) && styles.topControlButtonDisabled,
                pressed && !secondaryControlsDisabled ? styles.controlPressed : null,
              ]}
            >
              <MaterialIcons
                name={flashEnabled ? 'flash-on' : 'flash-off'}
                size={18}
                color={flashEnabled ? colors.primary : '#F6EFE8'}
              />
            </Pressable>

            <View style={styles.timerControls}>
              <Pressable
                testID="camera-timer-toggle"
                onPress={() => setIsTimerExpanded((current) => !current)}
                disabled={secondaryControlsDisabled}
                style={({ pressed }) => [
                  styles.topControlButton,
                  (isTimerExpanded || timerSeconds > 0) && styles.topControlButtonActive,
                  secondaryControlsDisabled && styles.topControlButtonDisabled,
                  pressed && !secondaryControlsDisabled ? styles.controlPressed : null,
                ]}
              >
                <MaterialIcons
                  name={timerIconName}
                  size={18}
                  color={(isTimerExpanded || timerSeconds > 0) ? colors.primary : '#F6EFE8'}
                />
              </Pressable>

              {isTimerExpanded ? (
                <View style={styles.timerGroup}>
                  {TIMER_OPTIONS.map((option) => {
                    const selected = timerSeconds === option;
                    return (
                      <Pressable
                        key={option}
                        testID={`camera-timer-${option}`}
                        onPress={() => {
                          setTimerSeconds(option);
                          setIsTimerExpanded(false);
                        }}
                        disabled={secondaryControlsDisabled}
                        style={({ pressed }) => [
                          styles.timerOption,
                          selected && styles.timerOptionActive,
                          secondaryControlsDisabled && styles.timerOptionDisabled,
                          pressed && !secondaryControlsDisabled ? styles.controlPressed : null,
                        ]}
                      >
                        <Text style={[
                          styles.timerOptionText,
                          selected && styles.timerOptionTextActive,
                        ]}
                        >
                          {formatTimerLabel(option)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.bottomControls}>
            <View style={styles.bottomControlsSpacer} />

            <Pressable
              testID="camera-lens-toggle"
              onPress={handleLensToggle}
              disabled={secondaryControlsDisabled || !supportsHalfZoom}
              style={({ pressed }) => [
                styles.lensToggleButton,
                (secondaryControlsDisabled || !supportsHalfZoom) && styles.lensToggleButtonDisabled,
                pressed && !secondaryControlsDisabled && supportsHalfZoom ? styles.controlPressed : null,
              ]}
            >
              <Text style={styles.lensToggleText}>{currentLensLabel}</Text>
            </Pressable>

            <Pressable
              testID="camera-flip"
              onPress={handleFlipPress}
              disabled={secondaryControlsDisabled}
              style={({ pressed }) => [
                styles.flipButton,
                secondaryControlsDisabled && styles.flipButtonDisabled,
                pressed && !secondaryControlsDisabled ? styles.controlPressed : null,
              ]}
            >
              <FontAwesome6 name="rotate-left" size={24} color="#F6EFE8" />
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable
        testID="camera-shutter"
        onPress={handleShutterPress}
        disabled={shutterDisabled}
        style={styles.shutterWrap}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.shutterBtn,
              (pressed || shutterDisabled) && { opacity: shutterDisabled ? 0.45 : 0.6 },
            ]}
          >
            <View style={styles.shutterBtnInner} />
          </View>
        )}
      </Pressable>

      <Text style={styles.helper}>{helperText}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    stage: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    promptText: {
      width: '100%',
      marginBottom: spacing.sm,
      textAlign: 'center',
      color: colors.primary,
      ...textStyles.bodyEmphasis,
    },
    cameraContainer: {
      width: '100%',
      aspectRatio: PHOTO_ASPECT_RATIO,
      overflow: 'hidden',
      borderRadius: radii.lg,
      backgroundColor: 'black',
      position: 'relative',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 16 },
      shadowRadius: 28,
      shadowOpacity: 0.16,
      elevation: 14,
      borderWidth: 1,
      borderColor: colors.barBorder,
    },
    camera: {
      flex: 1,
    },
    cameraFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000000',
    },
    cameraStatus: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    cameraStatusText: {
      ...textStyles.bodySmallStrong,
      color: '#F6EFE8',
      textAlign: 'center',
      backgroundColor: 'rgba(12,7,3,0.56)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      overflow: 'hidden',
    },
    countdownOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(12,7,3,0.24)',
    },
    countdownText: {
      ...textStyles.countdown,
      color: '#FFFFFF',
      textShadowColor: 'rgba(0,0,0,0.32)',
      textShadowOffset: { width: 0, height: 4 },
      textShadowRadius: 14,
    },
    cameraControlsOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    topControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    topControlButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(12,7,3,0.48)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    topControlButtonActive: {
      backgroundColor: colors.bg,
      borderColor: colors.primary,
    },
    topControlButtonDisabled: {
      opacity: 0.45,
    },
    topControlText: {
      ...textStyles.buttonCapsSmall,
      color: '#F6EFE8',
      letterSpacing: 0.4,
    },
    topControlTextActive: {
      color: colors.primary,
    },
    timerGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(12,7,3,0.48)',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
    },
    timerControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    timerOption: {
      minWidth: 50,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    timerOptionActive: {
      backgroundColor: colors.bg,
    },
    timerOptionDisabled: {
      opacity: 0.45,
    },
    timerOptionText: {
      ...textStyles.buttonCapsSmall,
      color: '#F6EFE8',
      letterSpacing: 0.45,
    },
    timerOptionTextActive: {
      color: colors.primary,
    },
    bottomControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    bottomControlsSpacer: {
      width: 44,
      height: 44,
    },
    lensToggleButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(12,7,3,0.48)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    lensToggleButtonDisabled: {
      opacity: 0.45,
    },
    lensToggleText: {
      ...textStyles.buttonSmall,
      color: '#F6EFE8',
      letterSpacing: 0.2,
    },
    shutterBtn: {
      borderWidth: 3,
      borderColor: colors.primary,
      width: 82,
      height: 82,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      shadowOpacity: 0.14,
      elevation: 8,
    },
    shutterWrap: {
      marginTop: spacing.md,
    },
    shutterBtnInner: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.primary,
    },
    flipButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(12,7,3,0.48)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    flipButtonDisabled: {
      opacity: 0.45,
    },
    controlPressed: {
      opacity: 0.72,
    },
    helper: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
}
