import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { corsOriginCheck } from '../config/cors';
import { loadUser, verifyToken } from '../middleware/auth';
import type { AuthUser } from '../types';

export const ROOM_COMMAND = 'command';
export const userRoom = (id: number) => `user:${id}`;

export type SocketEvent =
  | 'user_online'
  | 'user_offline'
  | 'location_updated'
  | 'mission_created'
  | 'mission_assigned'
  | 'mission_completed'
  | 'report_created'
  | 'report_updated'
  | 'report_deleted'
  | 'incident_created'
  | 'incident_updated'
  | 'stream_started'
  | 'stream_stopped'
  | 'notification'
  | 'activity'
  | 'stats_updated'
  | 'chat_message';

let io: Server | null = null;

interface SocketWithUser extends Socket {
  data: { user: AuthUser };
}

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: corsOriginCheck, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization ?? '').replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const payload = verifyToken(token);
      const user = await loadUser(payload.sub);
      if (!user) return next(new Error('Account is no longer active'));

      socket.data.user = user;
      next();
    } catch {
      next(new Error('Invalid session'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = (socket as SocketWithUser).data;

    socket.join(userRoom(user.id));
    if (user.role === 'superuser') {
      socket.join(ROOM_COMMAND);
    }

    socket.emit('connected', { userId: user.id, role: user.role });

    socket.on('disconnect', () => {
      // Presence is derived from GPS freshness (see services/presence), so a socket
      // drop alone does not mark personnel offline — it only stops the live feed.
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO has not been initialised');
  return io;
}

/** Broadcast to the command centre dashboard (commanders + operators). */
export function emitToCommand(event: SocketEvent, payload: unknown): void {
  io?.to(ROOM_COMMAND).emit(event, payload);
}

/** Send to one specific user (all of their open tabs). */
export function emitToUser(userId: number, event: SocketEvent, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Broadcast to every connected client. */
export function emitAll(event: SocketEvent, payload: unknown): void {
  io?.emit(event, payload);
}
