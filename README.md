# Getman

Getman is a React + TypeScript + Tailwind API client inspired by Postman.

## Features

- Compose requests with method, URL, headers, and body
- Send requests in two modes:
  - **Live HTTP** using browser `fetch`
  - **Offline Mock** for local/no-network testing
- Add Postman-style test rules and evaluate response assertions
- View response status, timing, headers, body, and test result report
- Save request presets to local storage and reload/delete them later

## Offline-friendly implementation

- No CDN dependencies are used at runtime.
- All styling comes from local Tailwind build configuration.
- Mock mode allows request/response workflow testing without internet access.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```
