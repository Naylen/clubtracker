FROM node:20-alpine AS base

RUN apk add --no-cache openssl postgresql-client
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM deps AS dev

COPY prisma ./prisma
RUN npx prisma generate
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "dev"]

FROM deps AS builder

COPY . .
RUN rm -rf .next && npx prisma generate && npm run build

FROM base AS prod

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "start"]
