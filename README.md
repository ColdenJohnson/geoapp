# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

2. Start the app

   ```bash
    npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).


## Backend base URL configuration

- Local/dev: set `EXPO_PUBLIC_BASE_URL` in `.env.local` (already present). Example: `http://192.168.x.x:3500`.
- Production builds: set `EXPO_PUBLIC_BASE_URL` in `.env.production`. This value is embedded at build time. Example currently:

```
EXPO_PUBLIC_BASE_URL=https://geode-backend-834952308922.us-central1.run.app
```

If the backend address changes, update the respective file and restart the dev server (for dev) or rebuild the app (for production).

## Push notifications

- The app requests permissions on sign-in, registers an Expo push token, and POSTs it (with uid/platform/timezone) to `/register_push_token` on the backend. The request includes the Firebase auth bearer token.
- Backend can trigger remote pushes—even if the app is killed—by sending to the stored Expo tokens. Example manual send:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "<ExpoPushToken>",
    "sound": "default",
    "title": "Geode ping",
    "body": "A new challenge is ready",
    "data": { "type": "challenge" }
  }'
```

Use `content-available: 1` for silent/background content fetches if needed.

## When installing new packages:
`npx expo install __`

`npx pod-install ios`

`npx expo run` & select `(ios)` or
`npx expo run --device`

After this process, the app can be started normally using `npx expo start`

## Publishing to app store process:
Set device to iOS device (arm 64)
Do Product -> Archive
