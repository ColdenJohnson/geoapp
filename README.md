# Welcome to SideQuest

Note that both the host and device must both be connected to a VPN (in China). The app will not load if the device cannot connect, and it will not populate pins if the host is not connected.

## Project overview

SideQuest is a **location-based photo challenge app**. Users create challenges at real-world map pins by posting a **prompt + photo**, then others physically visit that location to **contribute**, **view**, and **vote** in head-to-head duels.

### Core product loop
1. **Discover** challenges on the map
2. **Create/Contribute** a photo + prompt at a location
3. **View/Compete** through local and global duels (Elo-style ranking)
4. **Social + retention** via profiles, friends, and push notifications

---

## Quick summary (tech stack)

| Layer | Choice | Notes |
|---|---|---|
| Client | Expo + React Native | iOS-first, fast iteration |
| Navigation | Expo Router | file-based routes in `geoapp/app/` |
| Maps/Location | `react-native-maps` + `expo-location` | proximity gating + live user location |
| Media | `expo-camera`, `expo-image` | capture + caching/prefetch |
| Auth | Firebase Auth | email + phone (SMS) |
| Storage | Firebase Storage | image uploads + retrieval |
| Push | `expo-notifications` | deep links + telemetry |
| Backend | Node + Express (REST) | Mongoose models + auth middleware |
| DB | MongoDB (via Mongoose) | pins/challenges/duels/votes/users/friends |
| Deploy | Docker + Google Cloud Run | backend container deployed on GCR |
| API testing | Postman | endpoint validation + regression checks |
| Testing | Jest | unit tests for helpers/hooks/screens |

---

## Repository layout

> This repo is the frontend. Backend lives in a separate folder/repo depending on your setup; see “Backend” sections below.

### Top-level

| Path | Purpose |
|---|---|
| `geoapp/` | Expo/React Native app (primary) |
| `geoapp_backend/` (if present) | Dockerized backend artifacts / notes (varies by branch) |
| `README.md` | This file |
| `.github/` (if present) | CI/CD workflows |

### Frontend structure (`geoapp/`)

| Path | What’s inside |
|---|---|
| `geoapp/app/` | Expo Router routes + layouts (primary navigation) |
| `geoapp/screens/` | legacy screens (notably `LoginScreen.jsx`) |
| `geoapp/components/` | shared UI primitives + feature components (e.g., duel deck) |
| `geoapp/hooks/` | auth, theming, notifications hooks |
| `geoapp/lib/` | API client, geo utilities, queues, uploads |
| `geoapp/theme/` | tokens, palette, Colors mapping |
| `geoapp/config/` | firebase + logging |
| `geoapp/assets/` | fonts, icons, images |
| `geoapp/app.json` | Expo config (permissions, plugins, assets) |
| `geoapp/app.config.js` | env loading + config merge |
| `geoapp/jest.setup.js` | Jest setup |

---

## Feature map (what exists, where)

### Map & challenge discovery/creation

| Feature | Where | Key files |
|---|---|---|
| Live map with user location + pins | Map screen | `geoapp/app/(tabs)/index.jsx` |
| Pin callouts (prompt, author, count) | Map callouts | `geoapp/app/(tabs)/index.jsx` |
| Floating actions (create, center, friends-only) | Map UI | `geoapp/app/(tabs)/index.jsx` |
| Proximity gating (~80m) + toasts | Map logic/UI | `geoapp/app/(tabs)/index.jsx`, `geoapp/components/ui/Toast.jsx` |
| GCJ-02 conversion (Mainland China) | Geo utils | `geoapp/lib/geo.js` |
| Responsive map layout | Map UI | `geoapp/app/(tabs)/index.jsx` |

### Capture flow & creative prompting

| Feature | Where | Key files |
|---|---|---|
| In-app camera w/ shutter UI, 4:3, flip, retake | Capture flow | `geoapp/app/upload.jsx`, `geoapp/app/enter_message.jsx` |
| Two-stage flow (photo → prompt ≤ 50 chars) | Prompt screen | `geoapp/app/enter_message.jsx` |
| Prompt char counter + keyboard polish | Prompt UI | `geoapp/app/enter_message.jsx` |
| Image compression + upload pipeline | Upload helpers | `geoapp/lib/uploadHelpers.js` |
| Upload promise orchestration | Upload state | `geoapp/lib/promiseStore.js` |

### Viewing & immersion

| Feature | Where | Key files |
|---|---|---|
| Challenge detail screen + photo feed | Challenge view | `geoapp/app/view_photochallenge.jsx` |
| Fullscreen photo viewer modal | Viewer | `geoapp/app/view_photochallenge.jsx` |
| Bottom CTA bar (upload) | Shared UI | `geoapp/components/ui/BottomBar.jsx`, `geoapp/components/ui/Buttons.jsx` |
| Top bars / navigation polish | Shared UI | `geoapp/components/ui/TopBar.jsx` |

### Voting & competition (local + global)

| Feature | Where | Key files |
|---|---|---|
| Local duels inside a challenge | Challenge view | `geoapp/app/view_photochallenge.jsx` |
| Global duel feed (across system) | Vote tab | `geoapp/app/(tabs)/vote.jsx` |
| Swipeable duel deck UX | Duel deck | `geoapp/components/vote/DuelDeck.jsx` |
| Vote prefetch + queue (reduce latency) | Queue | `geoapp/lib/globalDuelQueue.js` |
| Rate-limit messaging / remaining votes | Vote tab | `geoapp/app/(tabs)/vote.jsx` |

### Social & identity

| Feature | Where | Key files |
|---|---|---|
| Profile (avatar, handle, bio, stats) | Profile tab | `geoapp/app/(tabs)/profile.jsx`, `geoapp/app/edit_profile.jsx` |
| Handle system (unique + auto-generation) | Backend + helper words | `geoapp_backend/server.js`, `geoapp/lib/handleWords.js` (paths vary) |
| Friends requests + list management | Friends | `geoapp/app/friends.jsx`, `geoapp/app/(tabs)/profile.jsx` |
| Friends-only filter on map | Map | `geoapp/app/(tabs)/index.jsx` |

### Auth & onboarding

| Feature | Where | Key files |
|---|---|---|
| Email/password + phone/SMS auth | Login | `geoapp/screens/LoginScreen.jsx` |
| Country picker for phone auth | Login | `geoapp/screens/LoginScreen.jsx` |
| Persisted auth/user bootstrapping | Auth context | `geoapp/hooks/AuthContext.js` |
| Sign out + account deletion (if enabled) | Profile/Backend | `geoapp/app/(tabs)/profile.jsx`, backend endpoints |

### Push notifications & engagement

| Feature | Where | Key files |
|---|---|---|
| Expo push token registration | Hook | `geoapp/hooks/usePushNotifications.js` |
| Deep-link routing from notifications | Hook/router | `geoapp/hooks/usePushNotifications.js` |
| Telemetry for delivered/opened events | Telemetry | `geoapp/lib/notificationTelemetry.js` (if present) |
| Vote refresh reminders | Engagement | `geoapp/lib/voteRefreshReminder.js` (if present) |

### Design system & visual language

| Feature | Where | Key files |
|---|---|---|
| Tokens (spacing/type/radius/shadows) | Theme | `geoapp/theme/tokens.js` |
| Palette (light/dark) | Theme | `geoapp/theme/palette.js`, `geoapp/theme/Colors.ts` |
| Shared primitives (buttons/cards/bars/toast) | UI | `geoapp/components/ui/*` |
| iOS blur tab bar + haptics | UI | `geoapp/components/ui/TabBarBackground.ios.tsx`, `geoapp/components/ui/HapticTab.tsx` |

### Performance & reliability

| Concern | Approach | Where |
|---|---|---|
| Image latency in duels | prefetch + caching | `geoapp/lib/globalDuelQueue.js`, `expo-image` usage |
| Network churn | AsyncStorage caching | `geoapp/hooks/AuthContext.js` |
| Battery drain | focus-scoped location tracking | `geoapp/app/(tabs)/index.jsx` |

---

## Routing (Expo Router)

Routes live in `geoapp/app/`.

| Route | File | Purpose |
|---|---|---|
| `/` | `geoapp/app/(tabs)/index.jsx` | Map + challenge discovery/creation |
| `/(tabs)/vote` | `geoapp/app/(tabs)/vote.jsx` | Global duel voting |
| `/(tabs)/profile` | `geoapp/app/(tabs)/profile.jsx` | Profile + stats + friends summary |
| `/view_photochallenge` | `geoapp/app/view_photochallenge.jsx` | Challenge detail + local duel + uploads |
| `/enter_message` | `geoapp/app/enter_message.jsx` | Capture + prompt for new challenge |
| `/upload` | `geoapp/app/upload.jsx` | Camera + upload for challenge photo |
| `/friends` | `geoapp/app/friends.jsx` | Friends list + requests |
| `/edit_profile` | `geoapp/app/edit_profile.jsx` | Profile editing |

Navigation notes:
- Tabs are defined in `geoapp/app/(tabs)/_layout.jsx`.
- Stack routes are configured in `geoapp/app/_layout.jsx`.
- Unauthenticated users see the legacy `geoapp/screens/LoginScreen.jsx`.

---

## Environment & configuration

### Required env vars
Environment variables are read by `geoapp/app.config.js` (loads `.env` then `.env.local`).

| Variable | Example | Used by |
|---|---|---|
| `EXPO_PUBLIC_BASE_URL` | `http://192.168.x.x:3500` | REST API base URL |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | `...` | Firebase config |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `...` | Firebase config |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `...` | Firebase config |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `...` | Firebase Storage |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `...` | Firebase config |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | `...` | Firebase config |

### Example `.env.local`
EXPO_PUBLIC_BASE_URL=
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...

## Backend base URL configuration

- Local/dev: set `EXPO_PUBLIC_BASE_URL` in `.env.local` (already present). Example: `http://192.168.x.x:3500`.
- Production builds: set `EXPO_PUBLIC_BASE_URL` in `.env.production`. This value is embedded at build time. Example currently:

```
EXPO_PUBLIC_BASE_URL=https://geode-backend-834952308922.us-central1.run.app
```

If the backend address changes, update the respective file and restart the dev server (for dev) or rebuild the app (for production).

## When installing new packages:
`npx expo install __`

`npx pod-install ios`

`npx expo run` & select `(ios)` or
`npx expo run --device`

After this process, the app can be started normally using `npx expo start`

## Publishing to app store:
Set device to iOS device (arm 64)
Do Product -> Archive

Currently, CI/CD Pipeline largely deals with this

## Gource File
https://github.com/acaudwell/Gource

gource /Users/colden/Documents/VSCode/Geo/geoapp \
  --start-date "2026-01-05" \
  --auto-skip-seconds 0.2 \
  --hide date \
  -1280x720 \
  -o - \
| ffmpeg -y -r 60 -f image2pipe -vcodec ppm -i - \
  -vcodec libx264 -preset medium -crf 18 \
  -pix_fmt yuv420p \
  gource.mp4
