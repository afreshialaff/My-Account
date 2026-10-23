# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w @aos/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build -w @aos/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w @aos/api --omit=dev --include-workspace-root=false
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
