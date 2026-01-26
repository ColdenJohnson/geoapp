## Principles
- Make the smallest change that solves the problem; avoid large refactors unless asked.
- Prefer minimum-complexity solutions and avoid unnecessary abstractions.
- Do not add new dependencies unless clearly justified.
- Do not delete existing comments; they are meaningful.

## Repo Map
```
.
|-- geoapp/                  # Expo/React Native app (frontend)
|   |-- app/                 # Expo Router routes (primary screens)
|   |-- screens/             # Legacy screens
|   |-- components/          # Shared UI
|   |-- hooks/               # React hooks (Auth, etc.)
|   |-- lib/                 # Client helpers / API wrappers
|   |-- config/              # App configuration
|   |-- constants/           # Shared constants
|   |-- theme/               # Theming/styles
|   |-- assets/
|   |-- scripts/             # Project utilities
|   |-- app.config.js
|   |-- app.json
|   |-- eas.json
|   |-- google-services.json
|   |-- GoogleService-Info.plist
|   `-- package.json
```

## Workflow
- Expo Router is file-based; new routes belong in `geoapp/app`.
