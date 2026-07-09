# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configurations and package metadata
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

# Install dev dependencies
RUN npm ci

# Copy full application source
COPY . .

# Build production client assets and compiled server bundles
RUN npm run build

# Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package package descriptors
COPY package*.json ./

# Install only production dependencies to minimize vulnerabilities
RUN npm ci --only=production

# Copy built deliverables from build stage
COPY --from=builder /app/dist ./dist

# Create a non-root system user for security hardening
RUN addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S nextjs -G nodejs && \
    mkdir -p /app/data && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["node", "dist/server.cjs"]