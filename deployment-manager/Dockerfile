FROM node:20-alpine

WORKDIR /app

# Install required tools
RUN apk add --no-cache curl docker-cli docker-compose git

# Create node user if it doesn't exist and set ownership
RUN chown -R node:node /app

# Switch to node user
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --production

COPY --chown=node:node . .

CMD ["node", "app.js"]