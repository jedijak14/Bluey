#!/usr/bin/env bash
# Fresh permission state must be arranged outside the instrumentation process.
set -eu
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell pm revoke app.bluey.companion android.permission.BLUETOOTH_CONNECT
adb shell pm clear-permission-flags app.bluey.companion android.permission.BLUETOOTH_CONNECT user-set user-fixed
set +e
(cd android && ./gradlew :app:connectedDebugAndroidTest --no-daemon --stacktrace) 2>&1 | tee android-native-test.log
result=${PIPESTATUS[0]}
adb logcat -d -s AndroidRuntime:E > android-crash.log
exit "$result"
