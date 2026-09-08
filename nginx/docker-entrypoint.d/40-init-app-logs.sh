#!/bin/sh
set -eu

apps_log_root=/var/log/nginx/apps

mkdir -p "$apps_log_root"
chown -R 1000:nginx "$apps_log_root"
find "$apps_log_root" -type d -exec chmod 2775 {} +
find "$apps_log_root" -type f -exec chmod 0660 {} +
