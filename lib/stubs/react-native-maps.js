// Web stub for react-native-maps.
// This file is used by metro.config.js when bundling for web so that route files
// importing react-native-maps can be bundled without errors.
// These components never render on web because the .web.jsx route files take over.
import React from 'react';
import { View } from 'react-native';

const Noop = () => React.createElement(View, null);

export default Noop; // MapView
export const Callout = Noop;
export const CalloutSubview = Noop;
export const Marker = Noop;
export const Polyline = Noop;
export const Polygon = Noop;
export const Circle = Noop;
export const Overlay = Noop;
export const Heatmap = Noop;
export const Geojson = Noop;
export const UrlTile = Noop;
export const LocalTile = Noop;
export const AnimatedRegion = class {};
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
