FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=3201
EXPOSE 3201

CMD ["node", "dist/main.js"]
