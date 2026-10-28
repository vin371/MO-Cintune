# CineTune deployment

This repository contains the CineTune web UI and the ZingMp3 API Express server based on [nvhung9/mp3-api](https://github.com/nvhung9/mp3-api).

## Render

Create a Blueprint from this GitHub repository. `render.yaml` configures a Node web service on the free plan. The service URL serves the app at `/cinetune/` and the API at `/api/...`.

Check `/health` first, then open `/cinetune/#home`.

## Android

Build the companion Android project from `android/` with `gradle :app:assembleDebug`.

The current APK is available at `/download/CineTune-Android.apk`. It opens the hosted web UI, so screen changes appear without reinstalling. Changes to the Android icon or native code require a new APK. Install version 1.5 over version 1.4 to keep local app data.
