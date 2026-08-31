# ==============================================================================
# Production Dockerfile for ERP Backend (Express + TypeScript + Prisma)
# Multi-stage build for minimal size, high security, and maximum performance.
# ==============================================================================

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install openssl for Prisma engine
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# Stage 2: Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=8001

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# Copy Prisma schema and generated engines
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma ./prisma

# Copy compiled JavaScript output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js

EXPOSE 8001

CMD ["node", "server.js"]
