import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Stream } from '../lib/types';

export const LIVE_STREAMS_KEY = ['streams'] as const;

/**
 * The one definition of the live-stream list.
 *
 * Two components previously declared their own query under the same
 * `['streams']` key but unwrapped the response differently — one kept
 * `{ streams: [...] }`, the other returned the array. React Query serves a
 * cached entry to whoever asks for the key, so navigating between them handed a
 * component the wrong shape and crashed it to a blank page, while a hard reload
 * "fixed" it by starting from an empty cache. Sharing the hook makes that class
 * of mismatch impossible.
 */
export function useLiveStreams() {
  return useQuery({
    queryKey: LIVE_STREAMS_KEY,
    queryFn: async (): Promise<Stream[]> => {
      const { data } = await api.get<{ streams: Stream[] }>('/streams');
      return data.streams;
    },
  });
}
