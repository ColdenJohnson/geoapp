# Welcome to SideQuest

Note that both the host and device must both be connected to a VPN (in China). The app will not load if the device cannot connect, and it will not populate pins if the host is not connected.

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

Use `content-available: 1` for silent/background content fetches if needed

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