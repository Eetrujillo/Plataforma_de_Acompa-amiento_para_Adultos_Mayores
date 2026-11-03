FROM node:20-alpine

WORKDIR /usr/src/app

# Prisma needs the schema before install so the client can be generated.
COPY package*.json ./
COPY prisma ./prisma

RUN npm install --omit=dev

# Generation only resolves the datasource URL, it does not connect.
ENV DATABASE_URL="mongodb://mongo:27017/mearn_db"
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
EXPOSE 3500

CMD ["npm", "start"]
