# Build context is the repository root (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app

COPY frontend/package.json ./
RUN npm install --no-audit --fund=false

COPY frontend/ ./
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
