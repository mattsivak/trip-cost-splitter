# syntax=docker/dockerfile:1

FROM node:20.19.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the postinstall runs `nuxt prepare`, which needs the source
# that this stage has not copied yet. The builder stage prepares it properly.
RUN npm ci --ignore-scripts

FROM node:20.19.0-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20.19.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
# Nitro's output is self-contained; no node_modules needed at runtime.
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
