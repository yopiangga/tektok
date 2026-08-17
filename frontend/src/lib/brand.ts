/**
 * Satu-satunya sumber nama brand.
 *
 * Sebelumnya string "TOCS" tersebar di header, footer, halaman login, dan judul
 * dokumen, sehingga ganti nama berarti berburu ke banyak berkas dan selalu ada
 * yang tertinggal. Semua tampilan brand sekarang membaca dari sini.
 */
export const BRAND = 'TEKTOK';

export const BRAND_TAGLINE = 'Sistem Komando Operasi Taktis';

/** Dipakai footer dashboard. */
export const BRAND_VERSION = 'v1.0';

/** Awalan nama berkas unduhan, mis. `tektok-reports-2026-08-02.csv`. */
export const BRAND_SLUG = 'tektok';

/* --------------------------------------------------------- brand mitra --- */

/**
 * Pemilik siaran yang tampil di dinding Siaran Langsung.
 *
 * Dipisah dari `BRAND`: TEKTOK adalah sistem komandonya, Kamera Nusantara
 * adalah pihak yang menyiarkan. Dinding siaran adalah satu-satunya tempat
 * keduanya muncul bersamaan.
 */
export const PARTNER_BRAND = 'Kamera Nusantara';

/**
 * Wordmark dipisah dua kata karena tampilannya memang berbeda: "KAMERA"
 * hitam, "NUSANTARA" merah brand — sama seperti logo aslinya.
 */
export const PARTNER_WORDMARK: readonly [string, string] = ['KAMERA', 'NUSANTARA'];

/**
 * Letak berkas logo di `frontend/public`, mis. `/kamera-nusantara.png`.
 *
 * Selama masih null, yang dipakai adalah wordmark tipografi. Ini disengaja:
 * `<img>` yang menunjuk berkas tidak ada akan tampil sebagai gambar rusak di
 * produksi, sedangkan wordmark selalu tampil benar. Begitu berkas logonya
 * ditaruh di `frontend/public`, cukup isi konstanta ini — header dan watermark
 * langsung memakai logo itu tanpa perubahan lain.
 */
export const PARTNER_LOGO_SRC: string | null = null;
