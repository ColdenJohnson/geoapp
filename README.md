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

### Notification payload contract (navigation)

When sending push notifications, include a routable target so the client can navigate after the user taps the notification (even from a cold start):

```json
{
  "to": "<ExpoPushToken>",
  "title": "New vote available",
  "body": "Jump back into the challenge",
  "data": {
    "route": "/view_photochallenge",
    "pinId": "abc123",
    "notificationId": "server-side-id"
  }
}
```

- `route` (string, required): one of `/(tabs)/index`, `/(tabs)/vote`, `/(tabs)/profile`, `/view_photochallenge`, `/friends`, `/edit_profile`, `/upload`, `/enter_message`.
- `pinId` (string, optional): passed as `params.pinId` to the routed screen (used by `/view_photochallenge`).
- Additional metadata like `notificationId` is allowed and ignored by routing.

### Backend endpoint for notification telemetry

Expose `POST /notification_event` to record client lifecycle events:

- Request body shape:
  ```json
  {
    "notificationId": "n-123",     // optional, string
    "event": "received",           // required: received | opened
    "uid": "firebase-uid",         // optional if unauthenticated
    "timestamp": "2026-02-04T12:00:00.000Z", // ISO string; client sends current time
    "route": "/view_photochallenge",        // optional route target
    "payload": { "route": "/view_photochallenge", "pinId": "abc123" } // optional raw push data
  }
  ```
- Semantics: `received` is emitted when a push arrives in foreground; `opened` is emitted when the user taps a notification (including cold-start launches). Backend can treat “delivered but no opened within SLA” as ignored.
- Response: `200 OK` with `{ success: true }` (or similar) is sufficient; failures are logged client-side but do not block navigation.

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
