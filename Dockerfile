# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- Stage 1: install dependencies ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---------- Stage 2: the image that actually runs ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN mkdir -p logs && chown node:node logs

USER node
EXPOSE 8000
CMD ["node", "server.js"]
