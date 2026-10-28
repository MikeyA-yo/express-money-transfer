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
RUN  apt-get update && apt-get install -y tini && rm -rf /var/lib/apt/lists/*

USER node
EXPOSE 8000

LABEL org.opencontainers.image.source="https://github.com/MikeyA-yo/express-money-transfer"
LABEL org.opencontainers.image.description="A simple RESTful API for managing accounts and transferring money between them. Built with Node.js, Express, and MongoDB (Mongoose)."
LABEL org.opencontainers.image.title="Express Money Transfer API"
LABEL org.opencontainers.image.version="1.0.0"

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
