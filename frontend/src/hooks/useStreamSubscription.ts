import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Quality, StreamCredentials } from '../lib/livekit';

export type StreamState = 'connecting' | 'waiting' | 'live' | 'preview-only' | 'error';

/**
 * Subscribes a `<video>` element to one live stream.
 *
 * Shared by the dashboard panel and the dedicated streaming wall so the
 * connection lifecycle — token fetch, lazy LiveKit import, track gating and
 * teardown — lives in exactly one place.
 */
export function useStreamSubscription(
  streamId: number,
  roomName: string,
  options: { highQuality?: boolean; initialQuality?: Quality } = {}
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<StreamState>('connecting');
  const [quality, setQuality] = useState<Quality>(options.initialQuality ?? 'good');

  const highQuality = options.highQuality ?? false;

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get<StreamCredentials>(`/streams/${streamId}/viewer-token`);
        if (cancelled) return;

        if (!data.live || !data.token) {
          setState('preview-only');
          return;
        }
        if (!videoRef.current) return;

        // livekit-client is ~530 kB; load it only once a tile actually needs it
        // so the first paint is never blocked by the WebRTC stack.
        const { subscribeToRoom } = await import('../lib/livekit');
        if (cancelled) return;

        dispose = await subscribeToRoom(data, videoRef.current, {
          highQuality,
          onQuality: (q) => setQuality(q),
          // Only a real video track promotes the tile to LIVE: an empty room
          // connects happily and would otherwise look identical to a working one.
          onVideo: (present) => {
            if (!cancelled) setState(present ? 'live' : 'waiting');
          },
        });
        if (!cancelled) setState((prev) => (prev === 'live' ? prev : 'waiting'));
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
    // roomName matters as much as id: restarting a broadcast reuses the stream
    // row but opens a fresh room, and a subscription keyed only on id would sit
    // in the abandoned room showing "waiting" forever. highQuality resubscribes
    // so the stage view pulls the top simulcast layer.
  }, [streamId, roomName, highQuality]);

  return { videoRef, state, quality };
}
