# Build context is the repository root (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app

COPY frontend/package.json ./
RUN npm install --no-audit --fund=false

COPY frontend/ ./

# Vite membakar import.meta.env.VITE_* saat build, bukan saat runtime, jadi
# alamat API harus sudah diketahui di sini.
#
# Nilai default menjaga perilaku satu-domain (path relatif, di-proxy Nginx).
# JANGAN dikosongkan: string kosong bukan nullish, sehingga `?? '/api'` di
# api.ts tidak akan menyala dan baseURL jadi '' — semua request salah alamat.
# Isi hanya bila frontend dan API berada di domain berbeda, mis.
#   VITE_API_URL=https://api-tektok.kameranusantara.id/api
#   VITE_SOCKET_URL=https://api-tektok.kameranusantara.id
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
