FROM node:22-alpine AS build
WORKDIR /app
COPY apps/web/package.json apps/web/package.json
RUN npm --prefix apps/web install
COPY apps/web apps/web
RUN npm run build --prefix apps/web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
