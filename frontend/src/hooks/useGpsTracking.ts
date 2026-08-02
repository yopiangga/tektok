import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface GpsState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  battery: number | null;
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported' | 'insecure';
  /** false once precise positioning failed and coarse positioning took over. */
  precise: boolean;
  lastSentAt: Date | null;
  error: string | null;
}

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

/**
 * Watches the device position and pushes it to the API on the blueprint's
 * 10-second cadence. The watcher runs continuously; only the upload is
 * throttled, so the on-screen coordinates stay current.
 */
export function useGpsTracking(enabled: boolean, intervalMs = 10_000): GpsState {
  const [state, setState] = useState<GpsState>({
    lat: null,
    lng: null,
    accuracy: null,
    battery: null,
    permission: 'prompt',
    precise: true,
    lastSentAt: null,
    error: null,
  });

  const latest = useRef<GeolocationPosition | null>(null);
  const battery = useRef<number | null>(null);

  // One-way: once precise positioning has failed here, retrying it just burns
  // battery and delays every subsequent fix.
  const [highAccuracy, setHighAccuracy] = useState(true);

  // Battery level — supported on Chromium browsers; silently skipped elsewhere.
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return;

    let manager: BatteryManager | null = null;
    const onChange = () => {
      if (!manager) return;
      const level = Math.round(manager.level * 100);
      battery.current = level;
      setState((prev) => ({ ...prev, battery: level }));
    };

    void nav.getBattery().then((b) => {
      manager = b;
      onChange();
      b.addEventListener('levelchange', onChange);
    });

    return () => manager?.removeEventListener('levelchange', onChange);
  }, []);

  const send = useCallback(async () => {
    const position = latest.current;
    if (!position) return;

    try {
      await api.post('/personnel/location', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? undefined,
        speed: position.coords.speed != null && position.coords.speed >= 0 ? position.coords.speed : undefined,
        heading: position.coords.heading ?? undefined,
        battery: battery.current ?? undefined,
        // Navigator.connection is non-standard; approximate signal from accuracy.
        signal: position.coords.accuracy ? Math.max(20, 100 - Math.round(position.coords.accuracy)) : undefined,
      });
      setState((prev) => ({ ...prev, lastSentAt: new Date(), error: null }));
    } catch {
      setState((prev) => ({ ...prev, error: 'Gagal mengirim posisi ke pusat komando' }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (!('geolocation' in navigator)) {
      setState((prev) => ({ ...prev, permission: 'unsupported', error: 'Perangkat tidak mendukung GPS' }));
      return;
    }

    // Browsers refuse geolocation outside a secure context. Opening the app on a
    // LAN address over plain HTTP (the normal way a field phone reaches it) fails
    // with PERMISSION_DENIED, which would otherwise be reported as "izin ditolak"
    // and send the user hunting through browser settings that cannot fix it.
    if (!window.isSecureContext) {
      setState((prev) => ({
        ...prev,
        permission: 'insecure',
        error:
          'GPS diblokir karena koneksi tidak aman (HTTP). Buka aplikasi melalui HTTPS ' +
          'atau localhost agar lokasi dapat dikirim.',
      }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latest.current = position;
        setState((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          permission: 'granted',
          // A later fix clears an earlier failure: these errors are frequently
          // transient (walking out of a building, Wi-Fi reconnecting).
          error: null,
        }));
      },
      (error) => {
        // Precise GPS is unavailable indoors, in urban canyons, and on desktops
        // with no GPS radio — a Mac locates by scanning Wi-Fi, which is what
        // kCLErrorLocationUnknown reports failing. Coarse positioning usually
        // still resolves, and an approximate position beats none at all for
        // command awareness, so degrade once rather than retrying a mode that
        // has already proven it cannot get a fix here.
        if (highAccuracy && error.code !== error.PERMISSION_DENIED) {
          setHighAccuracy(false);
          return;
        }

        setState((prev) => ({
          ...prev,
          permission: error.code === error.PERMISSION_DENIED ? 'denied' : prev.permission,
          error:
            error.code === error.PERMISSION_DENIED
              ? 'Izin lokasi ditolak — aktifkan GPS agar posisi terpantau'
              : error.code === error.TIMEOUT
                ? 'Perangkat belum mendapat sinyal lokasi — mencoba lagi otomatis'
                : 'Layanan lokasi tidak dapat menentukan posisi. Pastikan Location Services ' +
                  'dan Wi-Fi aktif untuk perangkat ini.',
        }));
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: highAccuracy ? 5_000 : 30_000,
        // Coarse positioning is slower to settle; a short timeout would abort it
        // before the first fix arrives.
        timeout: highAccuracy ? 15_000 : 30_000,
      }
    );

    const timer = setInterval(() => void send(), intervalMs);
    const firstPing = setTimeout(() => void send(), 2_000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      clearTimeout(firstPing);
    };
  }, [enabled, intervalMs, send, highAccuracy]);

  return { ...state, precise: highAccuracy };
}
