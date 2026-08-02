# TEKTOK — Deployment

**Status: terpasang dan berjalan.**

| | |
|---|---|
| Web | https://tektok.kameranusantara.id |
| API | https://api-tektok.kameranusantara.id |
| Server | `43.106.5.212` (Ubuntu 22.04, user `labadmin`, alias SSH `lab88`) |
| Direktori | `/opt/tektok` |
| Repo | https://github.com/yopiangga/tektok |
| Login awal | `admin` / `123456` |

---

## Arsitektur yang terpasang

VPS ini **tidak kosong**: Apache sudah memegang port 80/443 untuk
`imt.mogiro.site` (aplikasi Express di port 5001), ditambah container latihan
juice-shop dan DVWA di 8081/8082. TEKTOK karena itu dipasang **di belakang
Apache**, bukan menggantikannya.

```
                    ┌─ tektok.kameranusantara.id ──┐
Internet ──► Apache ┤                              ├─► 127.0.0.1:8080
             (TLS)  └─ api-tektok.kameranusantara ─┘         │
                                                             ▼
                                                  Nginx TEKTOK (container)
                                                   ├── /              → web (SPA)
                                                   ├── /api/          → api:4000
                                                   ├── /socket.io/    → api:4000
                                                   ├── /livekit/      → livekit:7880
                                                   ├── /media/        → minio:9000
                                                   └── /uploads/      → api:4000

Media WebRTC TIDAK lewat Apache: UDP 7882 / TCP 7881 langsung ke 43.106.5.212
```

Kedua domain menunjuk ke Nginx internal yang **sama**. Pemilahan dilakukan Nginx
berdasarkan path. Ini disengaja: backend mengembalikan URL lampiran sebagai path
relatif `/media/<key>`, yang di halaman web diselesaikan menjadi
`https://tektok.kameranusantara.id/media/<key>` — jadi domain web pun harus bisa
melayani `/media` dan `/uploads`, bukan hanya SPA.

Alamat API dibakar ke dalam bundel saat build (`VITE_API_URL`, `VITE_SOCKET_URL`),
karena Vite mengganti `import.meta.env.VITE_*` pada waktu build, bukan runtime.
**Mengubah domain API berarti harus build ulang image `web`.**

### Berkas yang mengatur ini

| Berkas | Peran |
|---|---|
| `docker-compose.prod.yml` | Stack dasar |
| `docker-compose.behind-proxy.yml` | Override: ikat ke `127.0.0.1:8080`, matikan certbot container, kirim build arg VITE |
| `nginx/nginx.behind-proxy.conf` | Nginx internal, HTTP polos, percaya `X-Forwarded-*` |
| `apache/tektok-proxy.conf` | Aturan proxy bersama (termasuk tunnel WebSocket) |
| `apache/tektok-web.conf`, `apache/tektok-api.conf` | Vhost per domain |
| `livekit.prod.yaml` | UDP mux 7882, ICE-TCP 7881, `node_ip` publik |

`nginx/nginx.prod.conf`, `nginx/bootstrap.conf`, dan `scripts/init-ssl.sh`
**tidak dipakai di sini**. Semuanya untuk VPS kosong yang port 80/443-nya bebas;
disimpan untuk kemungkinan itu.

---

## Perintah harian

Semua dijalankan di `/opt/tektok`. Pintasan:

```bash
ssh lab88
cd /opt/tektok
CP="docker compose -f docker-compose.prod.yml -f docker-compose.behind-proxy.yml --env-file .env.production"
```

| Tujuan | Perintah |
|---|---|
| Status | `$CP ps` |
| Log API | `$CP logs -f api` |
| Log LiveKit | `$CP logs -f livekit` |
| Restart satu service | `$CP restart api` |
| Matikan semua | `$CP down` |
| Nyalakan lagi | `$CP up -d` |

## Memperbarui aplikasi

```bash
ssh lab88 && cd /opt/tektok
git pull
CP="docker compose -f docker-compose.prod.yml -f docker-compose.behind-proxy.yml --env-file .env.production"
$CP build api web        # satu per satu: RAM server hanya 3,4 GB
$CP up -d
```

> **Jangan menjalankan `migrate.js` lagi.** `db/schema.sql` diawali
> `DROP TABLE ... CASCADE`, jadi mengulangnya menghapus seluruh personel,
> laporan, dan riwayat. Skrip itu sudah menolak berjalan bila tabel sudah ada
> (`NODE_ENV=production`), dan penolakan itu sudah diuji langsung di server ini.
> Untuk perubahan skema gunakan yang idempoten:
>
> ```bash
> $CP exec api node dist/db/patch.js
> ```

## Password

Seluruh akun memakai `123456`. Untuk menyetel ulang semuanya sekaligus:

```bash
$CP exec -e NEW_PASSWORD=123456 -e ALLOW_WEAK_PASSWORD_RESET=true api \
   node dist/tools/reset-passwords.js
```

`ALLOW_WEAK_PASSWORD_RESET` wajib karena di produksi ini menyamakan password
super user dengan password seluruh personel.

## Backup

```bash
ssh lab88 && cd /opt/tektok
CP="docker compose -f docker-compose.prod.yml -f docker-compose.behind-proxy.yml --env-file .env.production"

$CP exec -T postgres pg_dump -U tocs tocs | gzip > ~/tektok-$(date +%F).sql.gz

docker run --rm -v tocs_miniodata:/data -v ~:/backup alpine \
  tar czf /backup/tektok-media-$(date +%F).tar.gz -C /data .
```

Simpan juga `/opt/tektok/.env.production` — berisi `JWT_SECRET`, password
Postgres, dan kunci LiveKit yang dibuat acak saat deploy dan tidak ada
salinannya di mana pun.

---

## Yang sudah dikonfigurasi di server

- **Swap 2 GB** (`/swapfile`, permanen di `/etc/fstab`). Server hanya punya RAM
  3,4 GB tanpa swap; build frontend berisiko kehabisan memori tanpa ini.
- **Modul Apache** `proxy_wstunnel` dan `headers` diaktifkan. Keduanya belum
  aktif sebelumnya — tanpa `proxy_wstunnel`, Socket.IO dan signalling LiveKit
  gagal upgrade dan streaming tidak pernah tersambung.
- **ufw**: ditambah `7881/tcp` dan `7882/udp`. Sudah diverifikasi terjangkau
  dari internet, jadi security group penyedia VPS tidak memblokirnya.
- **Sertifikat** untuk kedua domain, diperbarui otomatis oleh certbot systemd
  timer milik host (bukan container).

## Sertifikat

```bash
sudo certbot certificates          # lihat masa berlaku
sudo certbot renew --dry-run       # uji perpanjangan
```

---

## Troubleshooting

**Siaran muncul tapi layar hitam**
Signalling jalan, media tidak sampai. Periksa kandidat yang diiklankan:

```bash
$CP logs livekit | grep "starting LiveKit server"
```

`nodeIP` harus `43.106.5.212`. VPS ini ber-NAT (IP internal `172.19.114.244`),
jadi kalau `use_external_ip` dinyalakan atau `node_ip` dihapus dari
`livekit.prod.yaml`, LiveKit akan mengiklankan alamat internal dan video tidak
pernah sampai.

**Login gagal / CORS**
`CORS_ORIGIN` di `.env.production` harus memuat `https://tektok.kameranusantara.id`
persis — tanpa garis miring di akhir. Di produksi backend tidak lagi
mengizinkan origin LAN privat.

**Frontend memanggil alamat API yang salah**
`VITE_API_URL` dibakar saat build. Ubah `.env.production` lalu
`$CP build web && $CP up -d`. Cek hasilnya:

```bash
curl -s https://tektok.kameranusantara.id/ | grep -o '/assets/index-[^"]*\.js'
curl -s https://tektok.kameranusantara.id/assets/index-XXXX.js | grep -o 'https://api-tektok[^"]*'
```

**Kamera/mikrofon/GPS tidak bisa diakses**
Harus lewat `https://tektok.kameranusantara.id`, bukan `http://43.106.5.212`.
Browser hanya memberi izin perangkat pada *secure context*.

**Apache tidak mau reload**

```bash
sudo apache2ctl configtest
```

Jangan `systemctl restart apache2` sembarangan — `imt.mogiro.site` ikut
terpengaruh. Pakai `sudo systemctl reload apache2` bila hanya mengubah vhost.

**MinIO console** tidak terbuka ke internet:

```bash
ssh -L 9001:127.0.0.1:9001 lab88     # lalu buka http://localhost:9001
```
