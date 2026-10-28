# CineTune deployment

This repository contains the CineTune web UI and the ZingMp3 API Express server based on [nvhung9/mp3-api](https://github.com/nvhung9/mp3-api).

## Render

Create a Blueprint from this GitHub repository. `render.yaml` configures a Node web service on the free plan. The service URL serves the app at `/cinetune/` and the API at `/api/...`.

Check `/health` first, then open `/cinetune/#home`.

## Android

Build the companion Android project with the actual Render URL:

`gradle :app:assembleDebug -PcinetuneUrl=https://YOUR-SERVICE.onrender.com/cinetune/#home`

The APK reads the same hosted web UI, so web updates on Render become available without rebuilding the APK. A new build is needed if the hosting URL changes.
