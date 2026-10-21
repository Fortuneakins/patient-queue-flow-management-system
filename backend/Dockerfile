FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/src ./src
COPY backend/scripts ./scripts
COPY db/migrations /db/migrations

RUN addgroup -S pqfms && adduser -S pqfms -G pqfms \
    && chown -R pqfms:pqfms /app /db
USER pqfms

EXPOSE 5000
CMD ["npm", "start"]
