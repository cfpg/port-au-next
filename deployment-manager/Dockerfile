FROM node:20-alpine

WORKDIR /app

# Install required tools including openssh-client
RUN apk add --no-cache curl docker-cli docker-compose git openssh-client util-linux-login

# Create docker group with GID 1001 to match host system and add node user
RUN addgroup -g 1001 docker && \
    addgroup node docker &&\
    newgrp docker

# Create necessary directories
RUN mkdir -p /app/apps && \
    mkdir -p /home/node/.ssh && \
    chown -R node:node /app /home/node/.ssh

# Add github.com to known hosts
RUN ssh-keyscan github.com > /home/node/.ssh/known_hosts && \
    chown node:node /home/node/.ssh/known_hosts

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --production

COPY --chown=node:node . .

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]