#!/bin/sh
set -e

# Start app as node user
exec su node -c "node app.js"
