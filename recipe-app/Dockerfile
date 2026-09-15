# Cucina is a static Vite bundle, so the image builds it and then hands the
# output to nginx. `vite preview` is a dev convenience and not a production
# server, which is why it isn't used here.

FROM node:22-alpine AS build
WORKDIR /app

# Manifests are copied first so the install layer caches independently of the
# source. The lockfile is globbed so the build still works without it, but when
# it is present npm resolves from it — which matters here, because Aquarium's
# bundle depends on specific @react-aria entry-point versions.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
