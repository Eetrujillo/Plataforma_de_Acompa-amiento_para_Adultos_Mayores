FROM node:22.23.3-trixie-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev --no-audit --no-fund --fetch-retries=5 \
	&& node -e "require('cors'); require('dotenv'); require('express'); require('pg')"

COPY . .

EXPOSE 3505

CMD ["npm", "start"]