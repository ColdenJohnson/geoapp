/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { light as paletteLight, dark as paletteDark } from '@/theme/palette';

export const Colors = {
  light: {
    text: paletteLight.text,
    background: paletteLight.bg,
    tint: paletteLight.primary,
    icon: paletteLight.textMuted,
    tabIconDefault: paletteLight.textMuted,
    tabIconSelected: paletteLight.primary,
  },
  dark: {
    text: paletteDark.text,
    background: paletteDark.bg,
    tint: paletteDark.primary,
    icon: paletteDark.textMuted,
    tabIconDefault: paletteDark.textMuted,
    tabIconSelected: paletteDark.primary,
  },
};
