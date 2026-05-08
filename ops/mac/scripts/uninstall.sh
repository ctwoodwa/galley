#!/usr/bin/env bash
# uninstall.sh — remove the background service and menu bar app.

set -euo pipefail

LABEL="com.inverted-stack.reader"
MENUBAR_LABEL="com.inverted-stack.reader.menubar"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
MENUBAR_PLIST="$HOME/Library/LaunchAgents/$MENUBAR_LABEL.plist"
APP_DEST="$HOME/Applications/Inverted Stack Reader.app"

echo "Uninstalling Inverted Stack Reader service…"

# Unload menu bar LaunchAgent first so it doesn't relaunch after pkill
launchctl bootout "gui/$(id -u)/$MENUBAR_LABEL" 2>/dev/null || \
  launchctl unload "$MENUBAR_PLIST" 2>/dev/null || true
echo "  Unloaded menu bar LaunchAgent"

pkill -f "InvertedStackReader" 2>/dev/null && echo "  Stopped menu bar app" || true

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || \
  launchctl unload "$PLIST" 2>/dev/null || true
echo "  Unloaded server LaunchAgent"

rm -f "$PLIST" && echo "  Removed server plist"
rm -f "$MENUBAR_PLIST" && echo "  Removed menu bar plist"
rm -rf "$APP_DEST" && echo "  Removed app"

echo "Done. The server log remains at ~/Library/Logs/inverted-stack-reader.log"
