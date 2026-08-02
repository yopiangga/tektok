# TEKTOK — Rekap Aplikasi

Bahan mentah untuk penyusunan buku panduan pengguna. Isinya diambil langsung
dari kode yang berjalan di produksi, bukan dari rencana atau rancangan.

- Web: https://tektok.kameranusantara.id
- Versi acuan: commit `73a94a2`

---

## 1. Apa itu TEKTOK

TEKTOK adalah **sistem komando operasi taktis**: satu ruang kendali untuk memantau
petugas di lapangan secara langsung. Lewat satu layar, komandan bisa melihat di
mana setiap petugas berada di peta, menonton siaran video langsung dari kamera
mereka, menerima laporan beserta foto dan video, memberi penugasan, dan berkirim
pesan — semuanya dalam hitungan detik, tanpa perlu telepon satu per satu.

Analogi yang mudah dipahami orang awam: **ruang kendali seperti di film**, tapi
berjalan di browser biasa dan HP biasa.

Dua sisi aplikasi:

| Sisi | Siapa | Perangkat |
|---|---|---|
| **Pusat komando** | Komandan / operator | Laptop atau komputer |
| **Lapangan** | Petugas | HP (tampilan mirip aplikasi video pendek) |

---

## 2. Empat peran pengguna

Setiap akun punya satu peran. Peran menentukan tampilan yang muncul setelah login
— pengguna tidak bisa berpindah sendiri.

| Peran | Nama di layar | Masuk ke | Perangkat | Fungsi |
|---|---|---|---|---|
| `superuser` | **Super User** | Dashboard | Laptop | Memantau semua, mengatur semua |
| `personnel` | **Personel** | Aplikasi lapangan | HP | Kirim posisi, siaran, laporan |
| `drone` | **Drone** | Stasiun Drone | Laptop | Siaran dari kamera drone |
| `screen` | **Share Screen** | Berbagi Layar | Laptop | Siaran isi layar komputer |

**Poin penting untuk buku:** hanya Super User yang bisa menambah dan menghapus
akun. Tidak ada pendaftaran mandiri — akun dibuatkan.

---

## 3. Syarat sebelum memakai

Bagian ini sering jadi sumber kebingungan terbesar bagi orang awam, jadi layak
dijadikan bab tersendiri.

1. **Harus lewat alamat `https://tektok.kameranusantara.id`.** Bukan lewat alamat
   angka (IP). Browser hanya mengizinkan aplikasi memakai kamera, mikrofon, dan
   GPS pada alamat yang aman (HTTPS). Kalau dibuka lewat alamat lain, tombol
   siaran dan lokasi tidak akan berfungsi dan **tidak akan ada pesan error yang
   jelas** — ini penting sekali ditulis di buku.
2. **Browser harus modern**: Chrome, Edge, Safari, atau Firefox versi baru.
3. **Izin harus diberikan.** Saat pertama kali, browser bertanya soal Lokasi,
   Kamera, dan Mikrofon. Kalau ditolak, izin harus dinyalakan ulang lewat
   pengaturan browser — tombolnya tidak akan bertanya dua kali.
4. **Perlu internet.** Siaran video butuh koneksi stabil.

---

## 4. Masuk ke sistem (semua peran)

Halaman login sama untuk semua orang. Yang membedakan adalah akun.

- Isi **Username** dan **Password**
- Ada tombol mata untuk menampilkan password
- Setelah berhasil, sistem otomatis mengarahkan ke tampilan sesuai peran

Sesi bertahan **12 jam**, setelah itu harus masuk lagi.

---

## 5. Sisi Pusat Komando (Super User)

### 5.1 Dashboard — layar utama

Bagian atas layar (selalu terlihat):

- **Nama sistem TEKTOK** dan operasi yang sedang aktif
- **Kotak pencarian** — mencari personel, misi, insiden, dan laporan sekaligus
- **Penanda "SISTEM AKTIF"** — hijau berarti data masuk secara langsung, merah
  berarti koneksi terputus
- **Jam dan tanggal**
- **Menu pengguna** — Pengaturan sistem dan Keluar

Enam kotak ringkasan angka:

| Kotak | Arti |
|---|---|
| Personel Aktif | Jumlah petugas yang sedang online |
| Siaran Langsung | Jumlah kamera yang sedang menyiarkan |
| Insiden Terbuka | Kejadian yang belum ditutup |
| Laporan Hari Ini | Laporan masuk sejak tengah malam |
| Misi Menunggu | Penugasan yang belum diterima petugas |
| Tingkat Online | Persentase kesiapan pasukan |

### 5.2 Panel-panel di dashboard

| Panel | Isi | Yang bisa dilakukan |
|---|---|---|
| **Peta** | Titik posisi semua personel, laporan, insiden | Klik titik untuk detail, tombol pusatkan |
| **Personel** | Daftar petugas | Cari nama/nomor/unit, saring status & unit, klik untuk detail |
| **Siaran** | Kamera yang sedang aktif | Klik untuk menonton |
| **Aktivitas** | Riwayat kejadian terbaru | Hanya dibaca |
| **Insiden** | Kejadian yang perlu ditangani | Ubah status, lihat lokasi di peta |
| **Misi** | Daftar penugasan | Buat, tugaskan, batalkan |
| **Notifikasi** | Peringatan sistem | Tandai dibaca |
| **Laporan** | Laporan masuk dari lapangan | Lihat foto/video, ubah, hapus, unduh CSV |

### 5.3 Detail personel

Klik salah satu nama personel untuk membuka jendela detail berisi:

- Foto, nama, nomor registrasi, unit, status kehadiran
- Nomor telepon, sisa baterai HP, kekuatan sinyal, koordinat GPS
- Misi yang sedang dijalankan
- Lima laporan terakhir
- Empat tombol aksi: **Lihat Siaran**, **Beri Misi**, **Kirim Pesan**,
  **Lihat di Peta**

### 5.4 Halaman Siaran Langsung

Halaman khusus untuk menonton banyak kamera sekaligus.

- **Tiga video per baris**, format lebar (landscape)
- **Suara per siaran** — bisa dinyalakan satu per satu, ada tombol "Bisukan semua"
- **Sematkan (pin)** — siaran yang disematkan selalu berada di depan meski ada
  siaran baru masuk. Pilihan ini tersimpan di browser, jadi tetap ada setelah
  halaman dimuat ulang.
- **Mode sorot (highlight)** — satu siaran dinaikkan jadi panggung lebar dengan
  kualitas lebih tinggi

### 5.5 Pengaturan Sistem

Empat tab:

| Tab | Isi |
|---|---|
| **Operasi** | Buat operasi, aktifkan salah satu, hapus. Hanya satu operasi aktif dalam satu waktu. |
| **Unit** | Kelompok/regu beserta warna penandanya di peta |
| **Pengguna** | Tambah, ubah, nonaktifkan, hapus akun. Reset password. |
| **Audit Log** | Catatan siapa melakukan apa dan kapan |

**Catatan untuk buku:** sebelum menghapus operasi atau pengguna, sistem lebih dulu
menampilkan berapa banyak laporan, misi, dan siaran yang akan ikut terhapus.
Ini disengaja supaya tidak ada penghapusan yang tak disadari.

---

## 6. Sisi Lapangan (Personel) — aplikasi HP

Tampilannya sengaja dibuat mirip aplikasi video pendek supaya langsung akrab.
Layar penuh, gelap, dengan menu di bawah.

### 6.1 Menu bawah

```
  Beranda      Misi      ( ● Siaran )      Pesan      Profil
```

Tombol tengah yang menonjol adalah **Siaran**.

### 6.2 Tombol pintas di sisi kanan layar (beranda)

Deretan tombol melayang, tidak memakan ruang konten:

- **Siaran** (merah) — mulai menyiarkan
- **Lapor** — kirim laporan
- **Misi** — lihat penugasan
- **Pesan** — hubungi komando

### 6.3 Beranda

Menampilkan status petugas sendiri, sinyal GPS, dan misi yang sedang berjalan
dengan tombol untuk menerimanya.

### 6.4 Siaran

Layar penuh dengan pratinjau kamera. Tombolnya:

- **Balik** — ganti kamera depan/belakang
- **Mikrofon** — nyalakan/matikan suara
- **Lapor** — kirim laporan tanpa keluar dari siaran
- **Tutup** — hentikan siaran

### 6.5 Lapor

Formulir laporan:

1. Pilih **jenis**: Informasi, Insiden, atau Minta Bantuan
2. Tulis **deskripsi**
3. Lampirkan **foto atau video** — bisa langsung ambil dari kamera, maksimal
   5 berkas
4. **Lokasi GPS dilampirkan otomatis**
5. Tekan **KIRIM LAPORAN**

Di bawah formulir ada daftar laporan sendiri, yang **bisa diubah dan dihapus**.
Laporan yang sudah diubah diberi tanda "diubah".

**Penting:** laporan **tidak perlu persetujuan siapa pun**. Begitu dikirim,
laporan langsung tercatat dan terlihat di pusat komando.

### 6.6 Misi

Daftar penugasan. Alurnya dua langkah: **Terima penugasan**, lalu **tandai
selesai** setelah dilaksanakan.

### 6.7 Pesan

Percakapan dua arah dengan pusat komando.

### 6.8 Profil

Data diri, nomor registrasi, telepon, dan sisa baterai perangkat.

---

## 7. Stasiun Drone

Untuk operator yang menyiarkan dari kamera drone lewat laptop. Tampilannya
desktop, bukan HP.

- Pilih **perangkat video** dan **perangkat audio** dari daftar
- Lihat **resolusi** dan **durasi** siaran
- Pilihan perangkat **dikunci selama siaran berjalan**, supaya tidak berubah
  tidak sengaja di tengah siaran

## 8. Berbagi Layar

Untuk menyiarkan isi layar komputer, misalnya peta atau rekaman CCTV.

Dua langkah, dan urutannya wajib:

1. **Pilih Layar** — browser menampilkan pilihan jendela/layar
2. **Mulai Siaran**

Bisa menyertakan **audio sistem**. Kalau layar berhenti dibagikan dari sisi
browser, aplikasi menangkapnya dan menghentikan siaran dengan rapi.

---

## 9. Konsep yang perlu dijelaskan di buku

### 9.1 Status kehadiran

Ditentukan otomatis dari pengiriman posisi, bukan diatur manual:

| Status | Warna | Arti |
|---|---|---|
| **Online** | Hijau | Mengirim posisi dalam 1 menit terakhir |
| **Idle** | Kuning | Tidak mengirim posisi lebih dari **1 menit** |
| **Offline** | Merah | Tidak mengirim posisi lebih dari **3 menit** |

HP personel mengirim posisi setiap **10 detik**. Sistem memeriksa ulang status
setiap **15 detik**. Baterai di bawah **20%** memicu peringatan.

### 9.2 Jenis laporan

| Jenis | Kapan dipakai |
|---|---|
| **Informasi** | Kabar biasa, tidak mendesak |
| **Insiden** | Ada kejadian |
| **Minta Bantuan** | Butuh dukungan segera |

### 9.3 Tingkat prioritas

Rendah · Sedang · Tinggi · Kritis

### 9.4 Status misi

Menunggu → Berjalan → Selesai (atau Dibatalkan)

### 9.5 Status insiden

Terbuka → Ditangani → Ditutup

---

## 10. Alur kerja lengkap — bahan bab tutorial

**Skenario A — Menyiapkan sistem dari nol (Super User)**

1. Masuk sebagai `admin`
2. Buka Pengaturan Sistem → tab **Unit** → buat unit, misal "OPS", pilih warna
3. Tab **Operasi** → buat operasi baru → aktifkan
4. Tab **Pengguna** → tambah akun personel, tentukan unit
5. Bagikan username dan password ke petugas

**Skenario B — Hari operasi (Personel)**

1. Buka `https://tektok.kameranusantara.id` di HP
2. Masuk dengan akun yang diberikan
3. **Izinkan** akses lokasi saat browser bertanya
4. Titik posisi muncul di peta komando, status berubah **Online**
5. Terima misi yang masuk
6. Mulai siaran saat diperlukan
7. Kirim laporan berfoto dari lokasi
8. Tandai misi selesai

**Skenario C — Memantau (Super User)**

1. Amati enam kotak angka dan peta
2. Buka halaman Siaran Langsung, sematkan kamera penting
3. Klik personel untuk detail, kirim pesan atau beri misi
4. Baca laporan masuk, tandai insiden yang perlu ditangani
5. Unduh laporan dalam bentuk CSV bila perlu

---

## 11. Masalah yang sering dialami orang awam

Layak dijadikan bab "Kalau Ada Masalah".

| Gejala | Penyebab | Solusi |
|---|---|---|
| Tombol siaran tidak berfungsi | Dibuka bukan lewat HTTPS, atau izin kamera ditolak | Pastikan alamatnya `https://tektok...`; nyalakan izin di pengaturan browser |
| Titik saya tidak muncul di peta | Izin lokasi ditolak, atau GPS mati | Nyalakan GPS dan izin lokasi, tunggu beberapa detik di area terbuka |
| Status saya Offline padahal aplikasi terbuka | HP mengunci layar / browser dihentikan sistem | Jaga aplikasi tetap terbuka, matikan penghemat baterai |
| Video siaran hitam | Jaringan memblokir jalur video | Coba jaringan lain, hindari WiFi publik yang ketat |
| Halaman kosong setelah pembaruan | Browser masih memakai versi lama | Muat ulang paksa: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac) |
| Tidak bisa menambah pengguna | Bukan akun Super User | Hanya Super User yang berwenang |

---

## 12. Glosarium

| Istilah | Penjelasan awam |
|---|---|
| **Operasi** | Satu kegiatan besar yang sedang berjalan; jadi payung semua data |
| **Unit** | Kelompok atau regu petugas |
| **Personel** | Petugas di lapangan |
| **Siaran / Streaming** | Video langsung dari kamera |
| **Sematkan / Pin** | Menahan satu siaran agar tetap di posisi depan |
| **Sorot / Highlight** | Membesarkan satu siaran jadi tampilan utama |
| **Insiden** | Kejadian yang perlu ditangani |
| **Misi** | Penugasan untuk petugas |
| **Audit Log** | Buku catatan siapa melakukan apa |
| **GPS** | Penunjuk lokasi dari satelit |
| **CSV** | Berkas tabel yang bisa dibuka di Excel |

---

## 13. Saran susunan buku

1. Pengenalan — apa itu TEKTOK, untuk siapa
2. Persiapan — perangkat, browser, izin (**bab paling penting**)
3. Masuk ke sistem
4. **Bagian A — Panduan Petugas Lapangan** (bab 5–9): beranda, siaran, lapor,
   misi, pesan, profil
5. **Bagian B — Panduan Pusat Komando** (bab 10–15): dashboard, peta, personel,
   siaran langsung, laporan, misi & insiden
6. **Bagian C — Panduan Administrator** (bab 16–18): operasi, unit, pengguna,
   audit
7. Panduan Drone dan Berbagi Layar
8. Kalau Ada Masalah
9. Glosarium

Saran penyajian: satu tugas satu halaman, dengan tangkapan layar bernomor dan
kalimat perintah pendek. Hindari istilah teknis di badan teks — pindahkan ke
glosarium.
