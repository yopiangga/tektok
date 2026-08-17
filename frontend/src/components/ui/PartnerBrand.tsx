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
export function PartnerWatermark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        // Bantalan terang, bukan gelap: logo dibuat untuk latar putih, jadi
        // warna brand tetap benar di atas video apa pun. Dengan logo bantalannya
        // putih pekat — logo itu membawa latar putihnya sendiri, dan bidang
        // separuh tembus di sekelilingnya akan terlihat seperti dua lapis.
        'pointer-events-none absolute select-none rounded-md px-2 py-1 shadow-soft',
        PARTNER_LOGO_SRC ? 'bg-white' : 'bg-white/80 backdrop-blur-sm',
        className
      )}
    >
      <PartnerMark height={22} textClassName="text-[9px]" />
    </div>
  );
}
