import { useEffect, useRef, useState } from 'react';
import { connectSocket } from '../lib/socket';

/**
 * Subscribes to a Socket.IO event for the lifetime of the component.
 * The handler is kept in a ref so callers can pass inline closures without
 * re-registering the listener on every render.
 */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    const socket = connectSocket();
    const listener = (payload: T) => saved.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}

/** Live connection state for the header indicator. */
export function useSocketStatus(): 'connected' | 'connecting' | 'disconnected' {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  useEffect(() => {
    const socket = connectSocket();
    setStatus(socket.connected ? 'connected' : 'connecting');

    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onError = () => setStatus('disconnected');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  return status;
}

/** Ticking clock for headers and stream durations. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
