FROM nginx:alpine

# Install certbot and its dependencies
RUN apk add --update python3 py3-pip && \
    apk add certbot certbot-nginx && \
    rm -rf /var/cache/apk/*

# Keep the default nginx command
CMD ["nginx", "-g", "daemon off;"] 