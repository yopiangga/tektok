# Deploy TEKTOK ke VPS

| | |
|---|---|
| Server | `43.106.5.212` |
| Domain | `tektok.kameranusantara.id` |
| Repo | `https://github.com/yopiangga/tektok` |

DNS sudah benar — `tektok.kameranusantara.id` me-resolve ke `43.106.5.212`.

Semua perintah di bawah dijalankan **di VPS** kecuali Langkah 1.

---

## Kenapa HTTPS wajib, bukan opsional

Selama ini aplikasi diakses lewat HTTP di jaringan lokal, dan itu membatasi banyak hal.
Browser hanya mengizinkan kamera, mikrofon, share screen, dan GPS pada *secure context*
(HTTPS atau `localhost`). Dengan domain + TLS, keterbatasan itu hilang: personel bisa
mengaktifkan GPS dan siaran dari HP mana pun, drone dan share-screen bisa dari laptop
mana pun.

Konsekuensinya satu hal harus ditangani: di halaman HTTPS, koneksi `ws://` polos ke
LiveKit diblokir browser sebagai *mixed content*. Karena itu signalling LiveKit
diarahkan lewat Nginx sebagai `wss://tektok.kameranusantara.id/livekit`, bukan
`ws://43.106.5.212:7880`. Media WebRTC-nya sendiri tetap lewat UDP langsung ke IP
publik — itu tidak kena aturan mixed content, tapi **port UDP-nya harus dibuka di
firewall** (lihat Langkah 3).

---

## Langkah 1 — Push kode ke GitHub (dari komputer lokal)

```bash
cd "/Users/yopiangga/Documents/Riset/91 STI/v1"

git add .gitignore DEPLOY.md docker-compose.prod.yml livekit.prod.yaml \
        nginx/nginx.prod.conf nginx/bootstrap.conf \
        scripts/init-ssl.sh .env.production.example \
        backend/src/db/migrate.ts
git commit -m "Tambah konfigurasi deployment produksi"
git push origin main
```

`.env.production` dan `certbot/` sudah masuk `.gitignore` — rahasia dan sertifikat
tidak akan ikut ter-push.

---

## Langkah 2 — Siapkan VPS

SSH masuk, lalu pasang Docker:

```bash
ssh root@43.106.5.212

apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker compose version     # harus muncul v2.x
```

Naikkan buffer UDP kernel. LiveKit memperingatkan buffer default (425 KB) terlalu
kecil untuk produksi; pada beberapa aliran bersamaan ini menyebabkan paket video
di-drop dan gambar patah-patah:

```bash
cat >> /etc/sysctl.conf <<'EOF'
net.core.rmem_max=16777216
net.core.wmem_max=16777216
EOF
sysctl -p
```

---

## Langkah 3 — Firewall

Port yang **harus** terbuka:

| Port | Protokol | Untuk |
|---|---|---|
| 22 | TCP | SSH |
| 80 | TCP | Redirect + perpanjangan sertifikat Let's Encrypt |
| 443 | TCP | Aplikasi + signalling LiveKit (wss) |
| 7881 | TCP | Fallback ICE-TCP untuk jaringan yang memblokir UDP |
| 7882 | UDP | **Media WebRTC.** Tanpa ini signalling sukses tapi video tidak pernah muncul |

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 7882/udp
ufw enable
ufw status
```

> Kalau penyedia VPS punya security group / firewall sendiri di panel mereka
> (Alibaba, AWS, dsb.), aturan yang sama harus dibuat **di sana juga**. `ufw`
> saja tidak cukup.

---

## Langkah 4 — Ambil kode

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/yopiangga/tektok.git tocs
cd /opt/tocs
```

---

## Langkah 5 — Isi environment

```bash
cp .env.production.example .env.production
nano .env.production
```

Isi keempat nilai yang bertanda `GENERATE`. Jalankan tiap perintah ini dan tempel
hasilnya:

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 24      # MINIO_SECRET_KEY
openssl rand -hex 32      # LIVEKIT_API_SECRET
```

Kosongkan `ADMIN_PASSWORD` bila ingin password acak yang dicetak sekali saat seeding.

```bash
chmod 600 .env.production
```

---

## Langkah 6 — Terbitkan sertifikat TLS

Harus dilakukan **sebelum** stack dinyalakan: Nginx menolak start kalau berkas
sertifikat yang dirujuknya belum ada.

```bash
./scripts/init-ssl.sh
```

Skrip ini menjalankan Nginx sementara di port 80, membuktikan
`/.well-known/acme-challenge/` benar-benar terjangkau dari internet, baru kemudian
meminta sertifikat. Kalau gagal, penyebabnya hampir selalu port 80 tertutup.

Untuk uji coba tanpa memakai kuota Let's Encrypt (batas 5 kegagalan/jam/domain):

```bash
./scripts/init-ssl.sh --staging   # sertifikat tidak dipercaya browser, hanya untuk tes
```

Kalau sudah lolos staging, hapus hasilnya lalu terbitkan yang asli:

```bash
rm -rf certbot/conf && ./scripts/init-ssl.sh
```

---

## Langkah 7 — Nyalakan stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Build pertama memakan beberapa menit. Semua service harus `Up`, dan
`postgres`/`minio`/`api` harus `(healthy)`.

---

## Langkah 8 — Siapkan database

```bash
cd /opt/tocs
CP="docker compose -f docker-compose.prod.yml --env-file .env.production"

$CP exec api node dist/db/migrate.js
$CP exec api node dist/db/seed.js
```

> `migrate.js` **hanya dijalankan sekali, saat instalasi pertama.** `schema.sql`
> diawali `DROP TABLE ... CASCADE`, jadi menjalankannya lagi nanti akan menghapus
> seluruh data. Lihat bagian *Memperbarui aplikasi*.

`seed.js` membuat satu akun super user (`admin`) dan **mencetak passwordnya sekali**
kalau `ADMIN_PASSWORD` dikosongkan. Catat sekarang juga.

Jangan jalankan `seed-demo.js` di produksi — skrip itu memang menolak berjalan saat
`NODE_ENV=production` kecuali dipaksa.

---

## Langkah 9 — Verifikasi

```bash
curl -s https://tektok.kameranusantara.id/health
# {"status":"ok","uptime":...}
```

Lalu buka `https://tektok.kameranusantara.id` di browser dan periksa:

- [ ] Gembok TLS hijau, tidak ada peringatan sertifikat
- [ ] Login sebagai `admin` berhasil
- [ ] Buat satu personel di **Pengaturan Sistem**, login dari HP, GPS terbaca
      (inilah yang tidak mungkin lewat HTTP)
- [ ] Personel mulai siaran → tile-nya muncul **dan videonya jalan** di halaman
      Siaran Langsung
- [ ] Kirim laporan berlampiran foto → foto tampil di dashboard

Ceklis nomor 4 adalah yang paling penting. Kalau tile muncul dengan layar hitam,
itu tandanya signalling jalan tapi media tidak — lihat bagian Troubleshooting.

---

## Memperbarui aplikasi

```bash
cd /opt/tocs
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Data (database, media, unggahan) tersimpan di Docker volume dan tidak terpengaruh.

> **Jangan pernah menjalankan ulang `migrate.js` di server yang sudah berisi data.**
> `schema.sql` diawali `DROP TABLE ... CASCADE` — menjalankannya lagi akan menghapus
> seluruh personel, laporan, dan riwayat. Skrip itu sekarang menolak berjalan di
> `NODE_ENV=production` bila tabel sudah ada, tapi jangan bergantung pada penjaga itu.
>
> Untuk perubahan skema pada server yang sudah jalan, gunakan skrip patch yang
> idempoten:
>
> ```bash
> docker compose -f docker-compose.prod.yml --env-file .env.production \
>   exec api node dist/db/patch.js
> ```

## Backup

```bash
cd /opt/tocs
CP="docker compose -f docker-compose.prod.yml --env-file .env.production"

# Database
$CP exec -T postgres pg_dump -U tocs tocs | gzip > ~/tocs-$(date +%F).sql.gz

# Media
docker run --rm -v tocs_miniodata:/data -v ~:/backup alpine \
  tar czf /backup/tocs-media-$(date +%F).tar.gz -C /data .
```

---

## Troubleshooting

**Nginx gagal start: `cannot load certificate`**
Langkah 6 belum dijalankan atau gagal. Cek `ls certbot/conf/live/tektok.kameranusantara.id/`.

**Login gagal dengan error CORS**
Di produksi backend hanya menerima origin yang persis sama. Pastikan
`PUBLIC_URL=https://tektok.kameranusantara.id` — tanpa garis miring di akhir, dan
`https`, bukan `http`.

**Siaran muncul tapi layarnya hitam**
Signalling jalan, media tidak sampai. Hampir selalu firewall UDP:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs livekit | grep -i candidate
```

Kandidat yang diiklankan harus `43.106.5.212:7882` (udp) dan `43.106.5.212:7881` (tcp).
Kalau yang muncul alamat `172.x.x.x`, `node_ip` di `livekit.prod.yaml` salah.
Kalau alamatnya benar tapi tetap hitam, port 7882/udp tertutup di firewall penyedia VPS.

**Kamera/mikrofon/GPS tidak bisa diakses**
Pastikan diakses lewat `https://tektok.kameranusantara.id`, bukan `http://43.106.5.212`.
Lewat IP langsung, browser tidak menganggapnya secure context dan semua izin perangkat
diblokir.

**Sertifikat mendekati kedaluwarsa**
Container `certbot` memperbarui otomatis tiap 12 jam dan Nginx me-reload tiap 6 jam.
Cek manual:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm --entrypoint certbot certbot certificates
```

**Melihat log**

```bash
CP="docker compose -f docker-compose.prod.yml --env-file .env.production"
$CP logs -f api
$CP logs -f proxy
$CP logs -f livekit
```

---

## Catatan arsitektur

- **MinIO console** tidak diekspos ke internet. Akses lewat SSH tunnel:
  `ssh -L 9001:127.0.0.1:9001 root@43.106.5.212`, lalu buka `http://localhost:9001`.
- **PostgreSQL** tidak punya port yang dipublikasikan sama sekali.
- **Port 7880** (signalling LiveKit) juga tidak dipublikasikan — browser
  mencapainya lewat `wss://tektok.kameranusantara.id/livekit` yang di-terminate
  TLS oleh Nginx.
- **Bucket media** dibuat otomatis saat unggahan pertama, lengkap dengan policy
  baca publik. Sebelum ada unggahan, `/media/...` wajar menjawab 403.
- LiveKit memakai **UDP mux** di satu port (7882) untuk semua peserta, bukan
  rentang 50000-50100. Satu lubang firewall, dan Docker tidak perlu menjalankan
  ratusan proses `docker-proxy`.
