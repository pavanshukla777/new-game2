---
name: Android APK build in Nix/Replit environment
description: How to build a Flutter release APK on Replit where the home device has a quota and Flutter comes from the Nix store.
---

## The Rule
The home device (/dev/vdb, 32 GB, shared with /tmp) has a user-level disk quota (~5–6 GB). Once filled by NDK/Gradle downloads, all writes fail with "Disk quota exceeded" even when df shows free space. Redirect ALL writable paths to /home/runner/workspace (/dev/vdf, 256 GB, no quota).

**Why:** The first build attempt downloads NDK (~1.5 GB) and Gradle (~1 GB) to /home/runner, quickly exhausting the quota. Every subsequent write (sdkmanager installs, cache files, symlinks) then fails.

**How to apply:** Set the following env vars on every `flutter build apk` invocation:
```bash
export ANDROID_SDK_ROOT=/home/runner/workspace/android-sdk-ws
export ANDROID_HOME=/home/runner/workspace/android-sdk-ws
export JAVA_HOME=/nix/store/xad649j61kwkh0id5wvyiab5rliprp4d-openjdk-17.0.15+6/lib/openjdk
export GRADLE_USER_HOME=/home/runner/workspace/.gradle-home
export JAVA_TOOL_OPTIONS="-XX:-UsePerfData -Djava.io.tmpdir=/home/runner/workspace/.gradle-tmp"
export XDG_CACHE_HOME=/home/runner/workspace/.cache
```

## Workspace Android SDK Layout
Pre-built SDK at `/home/runner/workspace/android-sdk-ws/`:
- `platform-tools/` — real binaries from Nix libexec (NOT symlinks; use `cp -rL`)
- `platforms/android-35/` — extracted from Nix `platform-35_r02.zip`
- `build-tools/35.0.0/` — extracted from Nix `build-tools_r35_linux.zip` (zip dir renamed from android-15)
- `build-tools/34.0.0` → symlink to 35.0.0 (AGP 8.7.3 requests 34 for plugin lint tasks)
- `cmake/3.22.1/` — extracted from Nix `cmake-3.22.1-linux.zip` + `source.properties`
- `ndk/27.0.12077973/` → symlink to `/home/runner/workspace/android-ndk/android-ndk-r27`
- `licenses/` — four hash files (android-sdk-license, android-sdk-preview-license, android-googletv-license, mips-android-sysimage-license)
- `cmdline-tools/latest/bin/sdkmanager` — stub script that exits 0

NDK source: Nix store `x65rzs7z86cmn95i1wd6wql8ka4jhvs8-android-ndk-r27-linux.zip` → `/home/runner/workspace/android-ndk/android-ndk-r27/` (Pkg.Revision=27.0.12077973).

## Gradle Init Script (required)
`/home/runner/workspace/.gradle-home/init.d/flutter-build-dir.gradle`:
- Redirects all project buildDirs to `/home/runner/workspace/.flutter-gradle-build/<name>` (avoids Nix store read-only builds)
- Forces `buildToolsVersion "35.0.0"` on all Android subprojects (prevents AGP from trying to download build-tools;34.0.0)

## JVM Crash Fix
`-XX:-UsePerfData` MUST be in `JAVA_TOOL_OPTIONS` (not just gradle.properties) to apply to Kotlin worker processes. Without it, `PerfLongVariant::sample()` throws SIGBUS in containerized environments (BUS_ADRERR on hsperfdata mmap). Also set `-Djava.io.tmpdir` to workspace.

## Build Config Changes (app/build.gradle.kts)
- `buildToolsVersion = "35.0.0"` — explicit, prevents AGP auto-install of build-tools 34
- `ndkVersion = "27.0.12077973"` — override flutter.ndkVersion
- `ndkPath = "/home/runner/workspace/android-ndk/android-ndk-r27"` — explicit path

## APK Output Location
The Gradle init.d build-dir redirect causes the APK to land at:
`/home/runner/workspace/build/app/outputs/flutter-apk/app-release.apk`
(not the default `flutter_client/build/...`). Copy to `flutter_client/build-output/` for the user.

## pubspec.yaml Removals
`rive` and `just_audio` were removed — they imported nothing in lib/ but caused NDK version conflicts (rive_common needs NDK 25, just_audio needs NDK 27). Without them, only `path_provider_android` needs NDK 27 (which we satisfy).

## local.properties
```
sdk.dir=/home/runner/workspace/android-sdk-ws
flutter.sdk=/nix/store/i07crp4mg1rimd97s1byrq4gasg7dsk5-flutter-wrapped-3.32.0-sdk-links
```

## Nix Store Keys
- Platform-tools: `9240zj71m8x38zwyw30xaqiwlphy6qqk-android-sdk-platform-tools-34.0.1`
- Platform-35: `c2wnqm80hxdf4n8id9kmpdqy19lxb65y-platform-35_r02.zip`
- Build-tools-35: `qb5q0wsvlw1iqflg9bm9dssf9l86xcln-build-tools_r35_linux.zip`
- NDK-r27: `x65rzs7z86cmn95i1wd6wql8ka4jhvs8-android-ndk-r27-linux.zip`
- CMake-3.22.1: `l9cj6w27jcwi6wnc2gp9lpa28x7mh98l-cmake-3.22.1-linux.zip`
- JDK-17: `xad649j61kwkh0id5wvyiab5rliprp4d-openjdk-17.0.15+6`
- Flutter SDK: `i07crp4mg1rimd97s1byrq4gasg7dsk5-flutter-wrapped-3.32.0-sdk-links`
