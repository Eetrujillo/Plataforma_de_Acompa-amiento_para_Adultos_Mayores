FROM node:22-alpine

WORKDIR /usr/src/app

# Dependencies first, so the layer cache survives source edits.
COPY package*.json ./
RUN npm ci

# TypeScript: compile to dist/ and drop the dev dependencies from the image.
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3500

CMD ["node", "dist/server.js"]
