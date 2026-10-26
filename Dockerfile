FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY --chown=node:node . .

RUN mkdir -p logs && chown node:node logs

USER node

EXPOSE 8000

CMD ["node", "server.js"]
