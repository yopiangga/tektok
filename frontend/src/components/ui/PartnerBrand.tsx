import { PARTNER_BRAND, PARTNER_LOGO_SRC, PARTNER_WORDMARK } from '../../lib/brand';
import { cx } from '../../lib/format';

/**
 * Tampilan brand Kamera Nusantara di dinding siaran.
 *
 * Dua bentuk, satu sumber: logo berkas kalau `PARTNER_LOGO_SRC` sudah diisi,
 * kalau belum wordmark tipografi. Keduanya dibungkus di sini supaya menambahkan
 * berkas logo nanti tidak perlu menyentuh halaman siaran.
 */

const [FIRST, SECOND] = PARTNER_WORDMARK;

/** Wordmark dua baris: "KAMERA" gelap di atas, "NUSANTARA" merah di bawah. */
function PartnerWordmark({
  tone = 'ink',
  className,
}: {
  /** `invert` untuk di atas video atau latar gelap. */
  tone?: 'ink' | 'invert';
  className?: string;
}) {
  return (
    <span
      aria-label={PARTNER_BRAND}
      className={cx(
        'inline-flex select-none flex-col font-bold uppercase leading-[1.05] tracking-[0.16em]',
        className
      )}
    >
      <span className={tone === 'invert' ? 'text-white' : 'text-kn-ink'}>{FIRST}</span>
      <span className={tone === 'invert' ? 'text-kn-light' : 'text-kn'}>{SECOND}</span>
    </span>
  );
}

/**
 * Logo berkas untuk header. Sengaja mengembalikan null selama berkasnya belum
 * ada, sehingga header memakai judul berwarna saja dan tidak ada gambar rusak.
 */
export function PartnerLogo({ height, className }: { height: number; className?: string }) {
  if (!PARTNER_LOGO_SRC) return null;
  return (
    <img
      src={PARTNER_LOGO_SRC}
      alt={PARTNER_BRAND}
      style={{ height }}
      className={cx('w-auto select-none object-contain', className)}
    />
  );
}

/** Logo kalau berkasnya ada, wordmark kalau tidak. Tinggi keduanya disetarakan. */
function PartnerMark({
  height,
  textClassName,
}: {
  height: number;
  textClassName?: string;
}) {
  return PARTNER_LOGO_SRC ? (
    <PartnerLogo height={height} />
  ) : (
    <PartnerWordmark className={textClassName} />
  );
}

/**
 * Penanda brand di dalam bingkai video, seperti bug stasiun televisi: ikut
 * terbawa saat frame diproyeksikan atau dipotret, bukan hanya menempel di
 * kerangka aplikasi.
 */
export function PartnerWatermark({
  className,
  /** Tinggi marknya; bantalan ikut menyesuaikan supaya proporsinya tetap sama. */
  height = 22,
  /** Nama akun yang sedang menyiarkan; kalau ada, muncul panel teks di kanan logo. */
  name,
  /** Baris kecil di bawah nama — unit, nomor, apa pun keterangannya. */
  caption,
}: {
  className?: string;
  height?: number;
  name?: string;
  caption?: string;
}) {
  return (
    <div
      className={cx(
        // Satu palang, dua bidang — seperti lower third siaran TV: bidang terang
        // untuk logo, bidang gelap untuk identitas. Logonya dibuat untuk latar
        // putih, jadi bantalan terang bukan pilihan gaya melainkan syarat agar
        // merah brand tetap benar di atas video apa pun.
        //
        // Bentuknya sengaja pipih dan memanjang: palang setinggi kartu akan
        // memakan bidang tengah frame, tepat tempat objek yang sedang ditonton.
        // Panjangnya diatur pemanggil lewat `className` (mis. `w-[30rem]`);
        // panel gelapnya meregang mengisi sisa, jadi teksnya tidak mengambang.
        'pointer-events-none absolute flex select-none items-stretch overflow-hidden rounded-lg shadow-lift',
        className
      )}
    >
      <div
        className={cx(
          'flex shrink-0 items-center px-4 py-2',
          PARTNER_LOGO_SRC ? 'bg-white' : 'bg-white/85 backdrop-blur-sm'
        )}
      >
        <PartnerMark height={height} textClassName="text-[10px]" />
      </div>

      {name && (
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 bg-ink/85 px-4 py-1.5 backdrop-blur-sm">
          <p className="truncate text-sm font-semibold uppercase leading-none tracking-wide text-white">
            {name}
          </p>
          {caption && (
            <p className="truncate text-[10px] leading-none text-white/70">{caption}</p>
          )}
        </div>
      )}
    </div>
  );
}
