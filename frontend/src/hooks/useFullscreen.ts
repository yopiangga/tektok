import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Layar penuh untuk satu elemen.
 *
 * Ditulis lewat awalan `webkit` juga: Safari lama — termasuk yang masih terpasang
 * di banyak mesin ruang kontrol — belum punya nama tanpa awalan, dan tanpa
 * cadangan ini tombolnya diam saja tanpa pesan apa pun.
 *
 * Status dibaca dari peristiwa `fullscreenchange`, bukan dari nilai yang kita
 * simpan sendiri saat menekan tombol: keluar lewat Esc atau lewat tombol
 * peramban tidak melewati kode kita, dan status simpanan akan tertinggal.
 */

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function currentElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(currentElement() === ref.current);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [ref]);

  const toggleFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;
    const element = ref.current as FullscreenElement | null;
    if (!element) return;

    if (currentElement()) {
      // Bisa jadi elemen lain yang sedang penuh; menutupnya tetap benar karena
      // hanya satu elemen dapat memegang layar penuh sekaligus.
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return;
    }

    // Ditolak kalau bukan dari gerakan pengguna; tombol selalu memenuhi syarat
    // itu, jadi kegagalan di sini berarti peramban memang tidak mengizinkan.
    void Promise.resolve(
      element.requestFullscreen?.() ?? element.webkitRequestFullscreen?.()
    ).catch(() => setIsFullscreen(false));
  }, [ref]);

  return { isFullscreen, toggleFullscreen };
}
