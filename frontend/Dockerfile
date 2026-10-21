FROM node:22.23.3-alpine3.24 AS build

WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# Empty API/socket base means same-origin paths served by the reverse proxy.
ARG VITE_API_BASE_URL=
ARG VITE_ANALYTICS_BASE_URL=/analytics
ARG VITE_SOCKET_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_ANALYTICS_BASE_URL=$VITE_ANALYTICS_BASE_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

FROM nginx:stable-alpine3.24
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
