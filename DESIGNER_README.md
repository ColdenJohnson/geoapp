# SideQuest — Designer Sandbox

A browser-based preview of the SideQuest UI. No Xcode, no device, no backend required.

---

## Setup

**One-time setup** (only needed the first time):

- Install [Node.js](https://nodejs.org) (v18 or later)
- In your terminal, navigate to this folder and run:

```bash
npm install
```

---

## Running the app

```bash
npm run designer
```

This opens the Expo developer tools in your browser. Press **W** in the terminal (or click **Open web**) to launch the app in a new browser tab.

The app starts logged in as a mock user with pre-populated quests, friends, and profile data — no credentials needed.

---

## Screens available in designer mode

| Tab | Status |
|-----|--------|
| Quests | ✅ Fully interactive |
| Vote | ✅ Fully interactive |
| Friends | ✅ Fully interactive |
| Profile | ✅ Fully interactive |
| Map | ⚠️ Shows placeholder (requires native device) |
| Camera / Photo | ⚠️ Shows placeholder (requires native device) |

---

## Safe areas to edit

These files are safe to change and will reflect immediately after saving (hot reload):

- **`components/`** — all UI components, including cards, buttons, modals, overlays
- **`app/(tabs)/active_challenges.jsx`** — Quests tab screen
- **`app/(tabs)/vote.jsx`** — Vote tab screen
- **`app/(tabs)/friends_tab.jsx`** — Friends tab screen
- **`app/(tabs)/profile.jsx`** — Profile tab screen
- **`app/(tabs)/_layout.jsx`** — Tab bar layout and icons
- **`theme/palette.js`** — color palettes (light and dark)
- **`theme/tokens.js`** — spacing, radius, shadow design tokens
- **`theme/typography.js`** — text styles and font sizes
- **`theme/Colors.ts`** — tab bar accent colors
- **`assets/images/`** — icons and images

---

## Changing mock data

The mock quests, friends, profile, and photos are defined in:

```
lib/designerMockData.js
```

Edit that file to change the content shown in the UI (quest prompts, profile names, photos, etc.).

---

## Known differences from the native app

- **Tab bar**: the floating, blurred tab bar (iOS) looks flat in the browser — this is expected
- **Fonts**: custom fonts may not load identically in every browser
- **Animations**: some native gesture animations behave slightly differently on web
- **Map tab**: shows a placeholder; map requires a native build
- **Camera tab**: shows a placeholder; camera requires a native build
- **Image uploads**: disabled; no files are sent anywhere
- **Push notifications**: disabled
- **Haptic feedback**: silent on web

---

## Stopping the server

Press `Ctrl + C` in the terminal.
