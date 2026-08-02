# TEKTOK — Sistem Komando Operasi Taktis

Sistem komando berbasis web untuk memantau, mengoordinasikan, dan mendokumentasikan
operasi lapangan. Dirancang untuk ±100 personel aktif secara bersamaan.

Terdiri dari **dua aplikasi** dalam satu SPA:

| Aplikasi | Rute | Pengguna | Karakter |
| --- | --- | --- | --- |
| Command Center Dashboard | `/dashboard` | Super User | padat informasi, realtime, monitor besar |
| Pengaturan Sistem | `/settings` | Super User | operasi, unit, pengguna, audit log |
| Personnel Web App | `/app` | Personel | mobile-first, tombol besar, 2–3 klik per aksi |
| Stasiun Drone | `/drone` | Drone | desktop, sumber video dari capture device laptop |
| Berbagi Layar | `/screen` | Share Screen | desktop, sumber dari layar/jendela/tab browser |

Tanpa fitur AI, tanpa integrasi CCTV, tanpa aplikasi mobile native.

---

## Tampilan

Seluruh antarmuka menggunakan **light mode**. Palet diturunkan dari style guide
blueprint dengan latar terang:

| Token | Nilai | Pemakaian |
| --- | --- | --- |
| `ink` | `#0F172A` | teks utama (Primary) |
| `accent` | `#2563EB` | aksi utama, tautan |
| `success` | `#10B981` | status online, misi selesai |
| `warning` | `#F59E0B` | idle, laporan, baterai menengah |
| `danger` | `#EF4444` | offline, insiden, siaran langsung |
| `canvas` | `#F1F5F9` | latar halaman |
| `canvas-raised` | `#FFFFFF` | kartu / panel |
| `line` | `#E2E8F0` | garis pembatas |

Border radius `12px`, bayangan lembut, font **Inter**, ikon **Lucide**.

---

## Stack

**Frontend** React 18 · Vite · TypeScript · TailwindCSS · React Router · TanStack Query · Leaflet · socket.io-client · livekit-client
**Backend** Express · TypeScript · Socket.IO · JWT · Zod · Multer
**Database** PostgreSQL 16 · **Storage** MinIO · **Streaming** WebRTC/LiveKit · **Proxy** Nginx · **Deploy** Docker Compose

---

## Menjalankan secara lokal

```bash
cp .env.example .env          # sesuaikan JWT_SECRET
npm install

npm run infra:up              # PostgreSQL + MinIO + LiveKit
npm run db:setup              # skema + roles + satu akun super user
npm run dev                   # API :4000  ·  Web :5173
```

Buka <http://localhost:5173>.

`npm run dev` hanya menjalankan API dan web. **Streaming dan penyimpanan objek
membutuhkan server sungguhan**, dan itulah yang disediakan `npm run infra:up`.
Tanpa langkah tersebut, siaran langsung akan berjalan dalam mode pratinjau —
kamera tampil di perangkat personel, tetapi video tidak diteruskan ke pusat
komando. Saat start, API mencetak status yang sebenarnya:

```
[livekit] reachable at http://localhost:7880 — streaming enabled
[livekit] NOT reachable … streaming will run in preview mode. Start it with: npm run infra:up
```

**Apa yang dijalankan masing-masing perintah:**

| Perintah | Menjalankan | Bukan |
| --- | --- | --- |
| `npm run infra:up` | PostgreSQL, MinIO, LiveKit (container) | API, web |
| `npm run db:setup` | migrasi skema + akun super user (sekali saja) | — |
| `npm run dev` | API `:4000`, web `:5173` | infrastruktur |

Ketiganya diperlukan. `infra:up` **tidak** menjalankan aplikasi, dan `dev` **tidak**
menjalankan infrastruktur.

> `infra:up` mendeteksi bila port 5432 sudah dipakai PostgreSQL lain (misalnya
> `docker run --name tocs-pg` dari panduan lama) dan hanya menjalankan layanan
> yang belum ada, alih-alih gagal dengan "port is already allocated".

### Isi database: bootstrap vs demo

`db:setup` sengaja **tidak** membuat data karangan. Yang dibuat hanya dua hal
yang memang wajib ada agar sistem bisa dipakai:

1. **roles** — data referensi; `users.role_id` adalah foreign key
2. **satu akun super user** — supaya ada yang bisa masuk

Unit, operasi, dan akun personel adalah catatan operasional nyata dan dibuat
lewat aplikasi (**Pengaturan Sistem → Unit / Operasi / Pengguna**), bukan
dikarang oleh seed.

Password super user dibuat acak dan dicetak **satu kali** saat seed berjalan, atau
ditentukan sendiri lewat `ADMIN_PASSWORD`:

```bash
ADMIN_USERNAME=komandan ADMIN_PASSWORD='…' npm run db:setup
```

Seed bootstrap bersifat idempoten — dijalankan ulang tidak menimpa akun yang ada.

Untuk demo, pengembangan UI, atau uji beban, muat dataset karangan lengkap
(6 unit, 1 operasi, 100 personel, 134 laporan, 38 misi, insiden, notifikasi):

```bash
npm run db:setup:demo     # skema + dataset demo
npm run db:seed:demo      # dataset demo saja
```

| Username | Peran |
| --- | --- |
| `admin`, `admin2` | Super User |
| `p001` … `p100` | Personel |

Password seluruh akun demo: `123456`.

> `db:seed:demo` melakukan `TRUNCATE` pada seluruh tabel dan menolak berjalan
> bila `NODE_ENV=production`. Kredensial demo hanya ditampilkan di halaman login
> pada build pengembangan, tidak pernah pada build produksi.

### Simulator lapangan (untuk dataset demo)

Dataset demo adalah snapshot. Tanpa GPS yang mengalir, presence sweep akan menandai
seluruh personel `offline` dalam beberapa menit — dashboard jadi terlihat mati.
Simulator menjalankan N perangkat virtual yang mengirim posisi setiap 10 detik
melalui jalur realtime yang sebenarnya:

```bash
COUNT=85 npm run simulate
```

---

## Deploy dengan Docker

```bash
cp .env.example .env
# WAJIB: isi JWT_SECRET  →  openssl rand -base64 48
docker compose up -d --build
docker compose exec api node dist/db/migrate.js
docker compose exec api node dist/db/seed.js      # roles + akun super user
# opsional, hanya untuk demo — MENGHAPUS seluruh data.
# Container berjalan dengan NODE_ENV=production sehingga seed demo diblokir;
# override eksplisit diperlukan agar tidak pernah terjadi tanpa disengaja:
# docker compose exec -e ALLOW_DEMO_SEED=true api node dist/db/seed-demo.js
```

Untuk streaming dari perangkat lain, jalankan compose dengan `HOST_IP` berisi
alamat yang dipakai klien untuk menghubungi host ini:

```bash
HOST_IP=192.168.1.10 docker compose up -d
```

Aplikasi tersedia di <http://localhost:8080> (Nginx → SPA + API + WebSocket + media).
Konsol MinIO di `:9001`, LiveKit di `:7880`.

Compose menyalakan MinIO dan LiveKit, sehingga `MINIO_ENABLED`/`LIVEKIT_ENABLED`
dipaksa `true` di dalam `docker-compose.yml`. Toggle di `.env` hanya berlaku untuk
`npm run dev`, di mana kedua layanan tersebut tidak berjalan.

---

## Peran & hak akses

Sistem memakai **empat peran**. Blueprint asli memisahkan Commander dan Operator,
tetapi staf komando diperlakukan sebagai satu kelompok sehingga pemisahan itu
hanya menambah permukaan otorisasi yang tidak dipakai. Peran Drone ditambahkan
kemudian untuk stasiun darat berbasis laptop, disusul Share Screen untuk
merelai konsol pemetaan atau radar ke pusat komando.

| Aksi | Super User | Personel | Drone | Screen |
| --- | :-: | :-: | :-: | :-: |
| Lihat seluruh personel, peta, laporan | ✓ | — | — | — |
| Tonton siaran langsung | ✓ | — | — | — |
| Buat insiden, tugaskan misi | ✓ | — | — | — |
| Verifikasi & ekspor laporan | ✓ | — | — | — |
| Kelola operasi, unit, pengguna | ✓ | — | — | — |
| Lihat audit log | ✓ | — | — | — |
| Mulai siaran langsung | — | ✓ | ✓ | ✓ |
| Kirim GPS | — | ✓ | — | — |
| Kirim laporan | — | ✓ | ✓ | ✓ |
| Lihat misi sendiri, chat komando | — | ✓ | ✓ | ✓ |

Akun `commander`/`operator` dari versi sebelumnya otomatis dipindahkan ke
`superuser` saat `npm run db:seed` dijalankan — tidak ada akun atau data hilang.

**Drone** dan **Share Screen** berperilaku seperti personel dalam hal cakupan
data (hanya melihat laporan dan misinya sendiri), tetapi **tidak masuk roster
personel lapangan** — tidak muncul di peta, panel personel, sweep presence,
maupun statistik "personel aktif". Alasannya: keduanya stasiun desktop, bukan
personel ber-GPS. Siarannya tetap tampil di dinding siaran komando.

Perbedaan teknis Share Screen: `getDisplayMedia()` menuntut gestur pengguna,
sehingga pemilihan sumber adalah langkah tersendiri sebelum menyiarkan —
menunggu respons API akan menghanguskan gestur itu. Operator juga bisa
menghentikan berbagi dari bilah bawaan browser, dan siaran ikut berakhir
otomatis agar pusat komando tidak menyimpan tile mati.

Penegakan dilakukan di server (`requireRole`), bukan hanya di UI. Personel hanya
dapat membaca laporan dan misi miliknya sendiri.

---

## Struktur

```
db/schema.sql              16 tabel sesuai blueprint
backend/src/
  config/env.ts            konfigurasi terpusat
  db/                      pool, migrate, seed
  middleware/              auth (JWT + RBAC), error handler
  realtime/io.ts           Socket.IO: room `command` + `user:<id>`
  routes/                  auth, personnel, reports, missions, incidents,
                           streams, notifications, messages, dashboard, settings
  services/                activity, notify, presence, stats, storage, livekit
  tools/simulate.ts        simulator perangkat lapangan
frontend/src/
  components/dashboard/    12 panel command center
  components/settings/     operasi, unit, pengguna, audit log
  components/ui/           primitif bersama (Card, Chip, Modal, …)
  hooks/                   useSocketEvent, useGpsTracking
  pages/Dashboard.tsx      tata letak 4 band
  pages/Settings.tsx       pengaturan sistem
  pages/field/             Home, Stream, Report, Mission, Chat, Profile
nginx/                     reverse proxy + konfigurasi SPA
```

Dashboard, Settings, dan halaman siaran dimuat secara lazy. Chunk awal 352 kB
(113 kB gzip); `livekit-client` (531 kB) baru diunduh saat ada siaran yang dibuka.

---

## Realtime

Socket.IO menyiarkan ke room `command` (commander + operator) dan `user:<id>`.

`user_online` · `user_offline` · `location_updated` · `mission_created` ·
`mission_assigned` · `mission_completed` · `report_created` · `report_verified` ·
`incident_created` · `incident_updated` · `stream_started` · `stream_stopped` ·
`notification` · `activity` · `stats_updated` · `chat_message`

Status kehadiran diturunkan dari **kesegaran GPS**, bukan dari koneksi socket —
perangkat yang berhenti melapor dianggap offline meskipun tab-nya masih terbuka
(`IDLE_AFTER_SECONDS`, `OFFLINE_AFTER_SECONDS`).

Pembaruan lokasi dari 100 personel digabung (coalesced) menjadi satu refetch per
detik di dashboard agar tidak membanjiri React Query.

---

## Catatan operasional

**MinIO dan LiveKit bersifat opsional.** Bila `MINIO_ENABLED=false`, lampiran
laporan disimpan ke `backend/uploads` dan disajikan lewat `/uploads`. Bila
`LIVEKIT_ENABLED=false`, personel tetap mendapat pratinjau kamera dan siaran tetap
tercatat di pusat komando, namun video tidak diteruskan — panel siaran menampilkan
status "mode pratinjau" alih-alih gagal diam-diam.

### Streaming: dua hal yang paling sering membuatnya "diam"

Sinyal WebRTC (WebSocket `:7880`) dan media WebRTC (UDP) berjalan di jalur
terpisah. Bila jalur media salah, gejalanya menyesatkan: ruang siaran terbuka,
tidak ada error di konsol, tetapi video tidak pernah tiba.

**1. Port UDP.** `livekit-server --dev` menyajikan media pada **satu port UDP:
7882** — bukan rentang. Kedua compose file mempublikasikan tepat port itu. Untuk
deployment non-dev, sediakan `livekit.yaml` dengan `rtc.port_range_start/end`,
publikasikan rentang tersebut, dan siapkan TURN untuk jaringan yang memblokir UDP.

**2. `--node-ip` (penyebab paling umum).** LiveKit mencantumkan alamat dirinya di
ICE candidate. Tanpa `--node-ip`, container mengiklankan IP jaringan Docker
(`172.x`) yang tidak dapat dijangkau siapa pun di luar bridge — sinyal tersambung,
video tidak pernah datang. Default `127.0.0.1` sudah benar untuk browser di mesin
yang sama.

**Streaming dari HP di Wi-Fi yang sama** butuh alamat LAN, bukan localhost:

```bash
HOST_IP=192.168.1.10 npm run infra:up     # LiveKit iklankan alamat LAN
# lalu buka aplikasi dari HP: http://192.168.1.10:5173
```

`LIVEKIT_URL=auto` (default) membuat API menurunkan alamat LiveKit dari host yang
dipakai browser, sehingga HP menerima alamat LAN dan bukan `localhost` milik server.

### HTTPS wajib untuk perangkat lapangan

Browser memblokir **GPS dan kamera** pada origin yang tidak aman. `localhost`
dikecualikan, tetapi `http://192.168.x.x` **tidak**. Membuka aplikasi personel
dari HP lewat HTTP biasa membuat dua fitur intinya mati sekaligus:

| Fitur | HTTP di `localhost` | HTTP di alamat LAN | HTTPS |
| --- | :-: | :-: | :-: |
| GPS (`navigator.geolocation`) | ✓ | ✗ | ✓ |
| Kamera (`getUserMedia`) | ✓ | ✗ | ✓ |

Aplikasi mendeteksi kondisi ini (`window.isSecureContext`) dan menyebutkan
penyebab sebenarnya — bukan "izin ditolak", yang akan menyesatkan pengguna
mencari pengaturan browser yang tidak akan menyelesaikan apa pun.

Untuk uji lapangan, sajikan melalui HTTPS: pasang sertifikat pada
`nginx/nginx.conf` (blok redirect HTTPS sudah disiapkan), atau gunakan tunnel
sementara seperti `cloudflared tunnel --url http://localhost:8080`.

Panel siaran membedakan tiga keadaan agar kegagalan terlihat, bukan tersamar
sebagai kotak hitam:

| Keadaan | Arti |
| --- | --- |
| `Menghubungkan…` | sedang meminta token dan menyambung ke ruang |
| `MENUNGGU` | ruang tersambung, perangkat belum mengirim track video |
| `LIVE` | track video benar-benar diterima dan dirender |

Baris siaran berstatus `live` **hanya** dibuat oleh `POST /streams/start` dari
perangkat sungguhan. Data seed sengaja hanya berisi riwayat `ended`: baris `live`
tanpa publisher akan mengiklankan ruang WebRTC kosong yang selamanya hitam.

**URL lampiran disimpan relatif** (`/media/<key>` atau `/uploads/<key>`), bukan
absolut. Endpoint MinIO adalah hostname internal Docker yang tidak dapat dijangkau
browser, dan menyimpan origin absolut akan merusak seluruh lampiran lama begitu
deployment pindah host atau beralih ke TLS. Nginx meneruskan `/media/` ke MinIO
dari origin aplikasi sehingga port MinIO tidak perlu diekspos ke klien.

**Rate limiter** dikunci pada kombinasi akun + klien untuk login, bukan IP saja,
agar 100 personel di belakang satu NAT tidak saling mengunci; brute force per akun
tetap dibatasi 10 percobaan / 5 menit. Rate limit di Nginx (100 r/s, burst 200)
berperan sebagai pelindung DoS di tepi dan mengembalikan `429`, bukan `503`.

**Keamanan**: JWT (cookie httpOnly + bearer), Helmet, CORS allowlist, rate limit,
validasi Zod di setiap endpoint, RBAC di server, dan audit trail `system_logs`.
Untuk produksi: pasang sertifikat TLS di `nginx/nginx.conf` dan aktifkan redirect
HTTPS yang sudah disiapkan.

---

## Skrip

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | API + web bersamaan |
| `npm run build` | build produksi keduanya |
| `npm run typecheck` | TypeScript strict, dua workspace |
| `npm run db:setup` | migrate + bootstrap (roles + akun super user) |
| `npm run db:setup:demo` | migrate + dataset demo (menghapus data lama) |
| `npm run simulate` | simulator perangkat lapangan (butuh dataset demo) |

---

## Cakupan v1

Seluruh 12 modul blueprint terpasang: Authentication · Dashboard · Personnel ·
Missions · Reports · Incident Management · Live Streaming · Activity Timeline ·
Notification Center · Chat · Map · System Settings (operasi, unit, pengguna,
audit log).

Di luar cakupan (roadmap): ringkasan laporan AI, deteksi objek, CCTV, drone,
pengenalan wajah, sinkronisasi offline/PWA, push notification, multi-operasi,
layer GIS, heatmap, dashboard analitik, generator PDF, multi-bahasa.
