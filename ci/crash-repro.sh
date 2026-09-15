#!/usr/bin/env bash
# BLACKBOX crash repro: install each APK variant, launch, capture logcat.
# Runs on the GitHub Actions emulator (see .github/workflows/diag-crash.yml).
set -u

run_case() {
  NAME=$1; APK=$2
  echo "########## CASE $NAME ##########"
  adb uninstall com.blackbox.app >/dev/null 2>&1 || true
  if ! adb install "$APK"; then echo "INSTALL FAILED for $NAME"; return 1; fi
  adb logcat -c
  adb shell am start -W -n com.blackbox.app/.MainActivity || true
  sleep 15
  PID=$(adb shell pidof com.blackbox.app | tr -d '\r\n ')
  echo "### $NAME pid after launch: '${PID}'"
  if [ -z "$PID" ]; then
    echo "### $NAME: PROCESS DIED - relaunching to catch crash loop"
    adb shell am start -W -n com.blackbox.app/.MainActivity || true
    sleep 8
  fi
  adb logcat -d > "logcat-$NAME.txt"
  echo "### $NAME FATAL lines:"
  grep -aE "FATAL EXCEPTION|E AndroidRuntime|Force finishing activity|Process com\.blackbox\.app has died" "logcat-$NAME.txt" | head -150 || echo "(none)"
  echo "### $NAME dropbox crashes:"
  adb shell dumpsys dropbox --print 2>/dev/null | grep -aA 50 "data_app_crash\|system_app_crash" | head -150 || echo "(none)"
  adb shell am force-stop com.blackbox.app || true
  return 0
}

run_case v201 v201.apk
run_case v202 v202.apk
run_case src-minified vsrc-minified.apk
run_case src-nominify vsrc-nominify.apk
echo "########## ALL CASES DONE ##########"
exit 0
