FROM node:22-alpine AS build
WORKDIR /app
COPY apps/server/package.json package.json
RUN npm install
COPY apps/server/tsconfig.json tsconfig.json
COPY apps/server/src src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY apps/server/package.json package.json
RUN npm install --omit=dev
COPY --from=build /app/dist dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
