# Cucina is one process: Express serves the compiled API and the built Vite
# bundle from the same port, so the deployment stays a single Aiven service.

FROM node:22-alpine AS build
WORKDIR /app

# Manifests first so the install layer caches independently of the source. The
# lockfile matters here because Aquarium's bundle depends on specific
# @react-aria entry-point versions.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Reinstalled rather than copied from the build stage so devDependencies and
# the build cache stay out of the runtime image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server/index.js"]
