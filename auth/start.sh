#!/bin/sh

# Run migrations
echo "Running better-auth migrations..."
npx @better-auth/cli migrate --y

# Start the application
echo "Starting better-auth service..."
npx ts-node --transpile-only src/index.ts 