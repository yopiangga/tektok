import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'tocs.hiddenStreams';

/**
 * Siaran yang disembunyikan operator dari tampilannya sendiri.
 *
 * Penyembunyian ini murni sisi tampilan: siaran tetap berjalan, tetap terhitung
 * sebagai "aktif", dan operator lain tetap melihatnya — yang berubah hanya
 * dinding siaran milik operator ini. Karena itu statusnya disimpan di
 * localStorage seperti sematan (pin), bukan di server.
 *
 * Store-nya berada di level modul supaya panel dashboard dan halaman siaran
 * membaca satu sumber yang sama; dua salinan state React akan saling ketinggalan
 * saat operator berpindah halaman.
 */

function read(): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

let hidden = read();
const listeners = new Set<() => void>();

function write(next: number[]) {
  hidden = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Penyimpanan penuh atau diblokir: sembunyikan tetap berlaku untuk sesi ini.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHiddenStreams() {
  const ids = useSyncExternalStore(
    subscribe,
    () => hidden,
    () => hidden
  );

  const hide = useCallback((id: number) => {
    if (!hidden.includes(id)) write([...hidden, id]);
  }, []);

  const show = useCallback((id: number) => {
    if (hidden.includes(id)) write(hidden.filter((x) => x !== id));
  }, []);

  const showAll = useCallback(() => {
    if (hidden.length) write([]);
  }, []);

  /**
   * Penyembunyian berlaku per sesi siaran. Begitu sesi berakhir, id-nya tidak
   * akan dipakai lagi, jadi dibuang agar daftar tidak menumpuk dan siaran
   * berikutnya dari personel yang sama muncul normal.
   */
  const prune = useCallback((liveIds: number[]) => {
    const next = hidden.filter((id) => liveIds.includes(id));
    if (next.length !== hidden.length) write(next);
  }, []);

  return { hidden: ids, hide, show, showAll, prune };
}
