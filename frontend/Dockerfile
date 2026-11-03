# Build stage: the SPA is compiled, then served as static files.
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage: nginx with the SPA bundle and the /api proxy.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/src/app/dist /usr/share/nginx/html

EXPOSE 3201

CMD ["nginx", "-g", "daemon off;"]
