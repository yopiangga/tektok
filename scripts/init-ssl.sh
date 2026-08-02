#!/usr/bin/env bash
# =============================================================================
# Menerbitkan sertifikat Let's Encrypt pertama untuk TOCS.
#
# Dijalankan SEKALI, sebelum stack produksi pertama kali dinyalakan. Nginx
# menolak start bila ssl_certificate menunjuk berkas yang belum ada, jadi
# sertifikat harus lebih dulu ada daripada nginx.prod.conf.
#
# Penerbitan memakai --webroot (bukan --standalone) supaya jalurnya persis sama
# dengan yang dipakai container certbot untuk perpanjangan otomatis: kalau skrip
# ini berhasil, perpanjangan 90 hari lagi juga akan berhasil.
#
#   ./scripts/init-ssl.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.production"
BOOTSTRAP="tocs-acme-bootstrap"

[[ -f "$ENV_FILE" ]] || {
  echo "✗ $ENV_FILE tidak ada. Salin dulu dari .env.production.example." >&2
  exit 1
}

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${DOMAIN:?DOMAIN belum di-set di .env.production}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL belum di-set di .env.production}"

STAGING_ARG=""
if [[ "${1:-}" == "--staging" ]]; then
  # Let's Encrypt membatasi 5 kegagalan/jam per domain. Uji coba dulu dengan
  # --staging saat mendebug DNS atau firewall.
  STAGING_ARG="--staging"
  echo "→ mode STAGING: sertifikat yang dihasilkan TIDAK dipercaya browser."
fi

mkdir -p "$ROOT/certbot/conf" "$ROOT/certbot/www"

if [[ -d "$ROOT/certbot/conf/live/$DOMAIN" ]]; then
  echo "✓ Sertifikat untuk $DOMAIN sudah ada — tidak diterbitkan ulang."
  echo "  Perpanjangan ditangani container certbot. Untuk paksa terbit ulang,"
  echo "  hapus certbot/conf/live/$DOMAIN dan jalankan skrip ini lagi."
  exit 0
fi

# --- Pemeriksaan DNS ---------------------------------------------------------
# Kegagalan paling umum: A record belum menunjuk ke VPS ini. Ketahuan sekarang
# jauh lebih murah daripada kena rate limit Let's Encrypt.
RESOLVED="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)"
if [[ -z "$RESOLVED" ]]; then
  echo "✗ $DOMAIN tidak dapat di-resolve. Pastikan A record sudah dibuat." >&2
  exit 1
fi
echo "→ $DOMAIN → $RESOLVED"

# --- Nginx sementara untuk menjawab tantangan HTTP-01 ------------------------
cleanup() { docker rm -f "$BOOTSTRAP" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
echo "→ menyalakan nginx sementara di port 80…"
docker run -d --name "$BOOTSTRAP" \
  -p 80:80 \
  -v "$ROOT/nginx/bootstrap.conf:/etc/nginx/nginx.conf:ro" \
  -v "$ROOT/certbot/www:/var/www/certbot" \
  nginx:1.27-alpine >/dev/null

sleep 3

# Bukti bahwa webroot benar-benar terlayani sebelum ACME dipanggil.
echo "ok" > "$ROOT/certbot/www/.probe"
if ! curl -fsS --max-time 10 "http://$DOMAIN/.well-known/acme-challenge/.probe" >/dev/null; then
  echo "✗ http://$DOMAIN/.well-known/acme-challenge/ tidak terjangkau dari luar." >&2
  echo "  Periksa: firewall port 80/tcp terbuka, dan A record menunjuk ke server ini." >&2
  rm -f "$ROOT/certbot/www/.probe"
  exit 1
fi
rm -f "$ROOT/certbot/www/.probe"
echo "✓ webroot terjangkau"

# --- Penerbitan --------------------------------------------------------------
echo "→ meminta sertifikat untuk $DOMAIN…"
docker run --rm \
  -v "$ROOT/certbot/conf:/etc/letsencrypt" \
  -v "$ROOT/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$CERTBOT_EMAIL" \
  --agree-tos --no-eff-email --non-interactive \
  $STAGING_ARG

echo ""
echo "✓ Sertifikat tersimpan di certbot/conf/live/$DOMAIN/"
echo "  Lanjut:  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build"
