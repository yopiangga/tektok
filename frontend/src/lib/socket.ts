import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './api';

let socket: Socket | null = null;
let socketToken: string | null = null;

/**
 * Returns the single shared Socket.IO connection, creating it on first use.
 *
 * Every `useSocketEvent` subscription calls this, and the dashboard registers a
 * dozen of them, so it must be idempotent: keying the guard on the token (not on
 * `socket.connected`) prevents each subscriber from tearing down the previous
 * socket mid-handshake and leaving the client permanently reconnecting.
 */
export function connectSocket(): Socket {
  const token = tokenStore.get();

  if (socket && socketToken === token) return socket;

  socket?.disconnect();
  socketToken = token;

  // Transports are left at the Socket.IO default (HTTP polling, then upgrade to
  // WebSocket). Forcing websocket-first breaks behind dev proxies that reject
  // the raw upgrade; the automatic upgrade succeeds through both Vite and nginx.
  socket = io(import.meta.env.VITE_SOCKET_URL ?? '/', {
    auth: { token },
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
