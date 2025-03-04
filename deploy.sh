#!/bin/bash
set -e

# The app to deploy, passed as an argument
APP_NAME=$1

# Deployment directory
DEPLOY_DIR="/apps"
cd $DEPLOY_DIR

# Pull latest code for the specific app
cd ./$APP_NAME
git pull origin main
cd $DEPLOY_DIR

# Create a unique container name with timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)
NEW_CONTAINER="${APP_NAME}_${TIMESTAMP}"
OLD_CONTAINER=$(docker-compose ps -q $APP_NAME)

# Build the new container without starting it
docker-compose build $APP_NAME

# Start the new container with a different name
docker-compose -p $NEW_CONTAINER up -d --no-deps --scale $APP_NAME=1 $APP_NAME

# Wait for the new container to be healthy
echo "Waiting for new container to be ready..."
sleep 10  # Basic approach - you could implement a health check here

# Update Nginx to point to the new container
# This is done by updating the container IP in the Nginx config
NEW_CONTAINER_ID=$(docker-compose -p $NEW_CONTAINER ps -q $APP_NAME)
NEW_CONTAINER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $NEW_CONTAINER_ID)

# Update Nginx config
sed -i "s/proxy_pass http:\/\/[0-9.]*:3000;/proxy_pass http:\/\/$NEW_CONTAINER_IP:3000;/" ./nginx/conf.d/${APP_NAME}.conf

# Reload Nginx (zero downtime)
docker-compose exec -T nginx nginx -s reload

echo "New container is live at ${NEW_CONTAINER_IP}"

# Give connections time to drain from old container
echo "Waiting for connections to drain..."
sleep 5

# Stop and remove the old container
if [ ! -z "$OLD_CONTAINER" ]; then
  docker stop $OLD_CONTAINER
  docker rm $OLD_CONTAINER
  echo "Old container removed"
fi

echo "Deployment of $APP_NAME complete"