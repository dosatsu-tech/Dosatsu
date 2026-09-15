<h1 align="center">Dosatsu</h1>
<p align="center">
  <img src="public/favicon.png" alt="Dosatsu logo" width="120" />
</p>

<h3 align="center">An open source lightweight multiplatform photo editor</h3>

## How to install

For macOS or Windows installers go to [releases](https://github.com/dosatsu-tech/Dosatsu/releases/) or scroll down to build installers yourself from source.

## Preview

![Presets panel](public/presets.png)
![Adjustments panel](public/adjustments.png)
![Gallery view](public/gallery.png)

## About this project

Built with (React + TypeScript UI) + Rust image processing engine.

Packaged with [Tauri](https://tauri.app)

## Development

```bash
npm install
npm run tauri dev
```

## Building installers

```bash
npm run tauri build
```

Run this on macOS to produce a `.app`/`.dmg`, and on Windows to produce an `.msi`/`.exe` installer.
Tauri's bundler targets the OS you build on, so cross-platform installers require building on (or
CI runners for) each target OS.

## Building for Android

Requires [Android Studio](https://developer.android.com/studio) (for the SDK/NDK) and the Android
Rust targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Set `ANDROID_HOME` and `NDK_HOME` to your SDK/NDK install paths (Android Studio's SDK Manager shows
these under SDK Tools), then:

```bash
npm run tauri android dev    # run on a connected device/emulator, with hot reload
npm run tauri android build  # produce a release .apk/.aab
```

This repo already has `src-tauri/gen/android/` checked in (from a prior `npm run tauri android
init`), so `init` shouldn't be needed again — only re-run it if that directory is deleted.

## Building for iOS

Requires Xcode (macOS only) and the iOS Rust targets:

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

```bash
npm run tauri ios init   # first time only
npm run tauri ios dev    # run on a simulator or connected device
npm run tauri ios build  # produce a release build for TestFlight/App Store submission
```

A physical device (as opposed to the simulator) and any App Store submission both require an Apple
Developer account for code signing, configured the usual Xcode way (open
`src-tauri/gen/ios/*.xcodeproj` and set your team under Signing & Capabilities) after `ios init`
has generated the project.

## License

[MIT](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
