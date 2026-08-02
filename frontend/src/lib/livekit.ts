import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
  LocalAudioTrack,
  LocalVideoTrack,
  createLocalAudioTrack,
  createLocalVideoTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';

export interface StreamCredentials {
  url: string;
  token: string;
  roomName: string;
  live: boolean;
  streamId?: number;
}

export type Quality = 'good' | 'fair' | 'poor';

export function mapQuality(quality: ConnectionQuality): Quality {
  if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) return 'good';
  if (quality === ConnectionQuality.Poor) return 'poor';
  return 'fair';
}

export interface SubscribeHandlers {
  onQuality?: (quality: Quality) => void;
  /**
   * Request the top simulcast layer regardless of how large the video element
   * is. Adaptive streaming sizes the stream to the element, which is right for
   * a wall of small tiles but wrong for the expanded view a commander opens
   * precisely because they need to see detail.
   */
  highQuality?: boolean;
  /**
   * Fires when a video track is actually attached / detached. Connecting to a
   * room says nothing about whether anyone is publishing into it — an empty
   * room connects happily — so the UI must gate its "LIVE" state on this,
   * not on `connect()` resolving.
   */
  onVideo?: (present: boolean) => void;
}

/**
 * Connects as a subscriber and attaches remote video/audio to the given media
 * element. Returns a disposer.
 */
export async function subscribeToRoom(
  credentials: StreamCredentials,
  videoEl: HTMLVideoElement,
  handlers: SubscribeHandlers = {}
): Promise<() => void> {
  // adaptiveStream picks a simulcast layer from the element's rendered size —
  // exactly what a 4x4 tile wall wants, and exactly what the expanded view does
  // not, so the full-screen viewer opts out and asks for the top layer.
  const room = new Room({ adaptiveStream: !handlers.highQuality, dynacast: true });

  const attach = (track: RemoteTrack, publication?: RemoteTrackPublication) => {
    if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
      track.attach(videoEl);
      if (track.kind === Track.Kind.Video) {
        if (handlers.highQuality) publication?.setVideoQuality?.(VideoQuality.HIGH);
        handlers.onVideo?.(true);
      }
    }
  };

  const detach = (track: RemoteTrack) => {
    track.detach(videoEl);
    if (track.kind === Track.Kind.Video) handlers.onVideo?.(false);
  };

  room.on(RoomEvent.TrackSubscribed, attach);
  room.on(RoomEvent.TrackUnsubscribed, detach);
  room.on(RoomEvent.ConnectionQualityChanged, (quality) =>
    handlers.onQuality?.(mapQuality(quality))
  );

  await room.connect(credentials.url, credentials.token);

  // Tracks published before we joined are not replayed as events.
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.track) {
        attach(publication.track as RemoteTrack, publication as RemoteTrackPublication);
      }
    }
  }

  return () => {
    room.off(RoomEvent.TrackSubscribed, attach);
    room.off(RoomEvent.TrackUnsubscribed, detach);
    void room.disconnect();
  };
}

/**
 * Publishes an already-captured screen share.
 *
 * The MediaStream is passed in rather than captured here on purpose:
 * `getDisplayMedia()` requires transient user activation, which the round-trip
 * to `POST /streams/start` would consume. Capturing on the click and publishing
 * afterwards also lets the operator confirm what they are about to broadcast.
 */
export async function publishScreenToRoom(
  credentials: StreamCredentials,
  stream: MediaStream,
  options: { videoEl?: HTMLVideoElement } = {}
): Promise<{
  room: Room;
  stop: () => Promise<void>;
}> {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  await room.connect(credentials.url, credentials.token);

  const mediaTrack = stream.getVideoTracks()[0];
  // Tells the encoder to preserve sharp edges over smooth motion — screen shares
  // are usually text and map lines, where blur is what makes them unreadable.
  mediaTrack.contentHint = 'detail';

  const videoTrack = new LocalVideoTrack(mediaTrack);
  await room.localParticipant.publishTrack(videoTrack, {
    // Simulcast is off: re-encoding a screen at several sizes is what turns
    // small text into mush, and viewers need the detail layer regardless.
    simulcast: false,
    videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 15 },
  });

  // System audio, when the operator ticked "share audio" in the picker.
  const systemAudio = stream.getAudioTracks()[0];
  let audioTrack: LocalAudioTrack | undefined;
  if (systemAudio) {
    audioTrack = new LocalAudioTrack(systemAudio);
    await room.localParticipant.publishTrack(audioTrack, { dtx: false });
  }

  if (options.videoEl) videoTrack.attach(options.videoEl);

  return {
    room,
    stop: async () => {
      videoTrack.stop();
      audioTrack?.stop();
      stream.getTracks().forEach((t) => t.stop());
      await room.disconnect();
    },
  };
}

/** Connects as a publisher and starts camera + microphone. */
export async function publishToRoom(
  credentials: StreamCredentials,
  options: {
    videoEl?: HTMLVideoElement;
    facingMode?: 'user' | 'environment';
    audio?: boolean;
    /** Explicit capture devices — a laptop ground station has several. */
    videoDeviceId?: string;
    audioDeviceId?: string;
  }
): Promise<{
  room: Room;
  setMicEnabled: (enabled: boolean) => Promise<void>;
  stop: () => Promise<void>;
}> {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  await room.connect(credentials.url, credentials.token);

  // Tracks are created explicitly rather than via enableCameraAndMicrophone():
  // the convenience helper captures at the browser default of 480p, and the
  // command centre can never see more detail than the source carries, however
  // large the expanded view is.
  const videoTrack: LocalVideoTrack = await createLocalVideoTrack({
    resolution: VideoPresets.h720.resolution,
    // deviceId wins when given: on a drone ground station the source is a chosen
    // capture card, not a facing direction.
    ...(options.videoDeviceId
      ? { deviceId: options.videoDeviceId }
      : { facingMode: options.facingMode ?? 'environment' }),
  });

  await room.localParticipant.publishTrack(videoTrack, {
    // Simulcast lets one broadcast serve both uses at once: tiles pull the 180p
    // layer, the expanded view pulls 720p. Without it every viewer pays full
    // bitrate, which does not hold at the 10 concurrent streams this targets.
    simulcast: true,
    videoEncoding: VideoPresets.h720.encoding,
    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  });

  let audioTrack: LocalAudioTrack | undefined;
  if (options.audio !== false) {
    audioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      ...(options.audioDeviceId ? { deviceId: options.audioDeviceId } : {}),
    });
    await room.localParticipant.publishTrack(audioTrack, {
      // Field audio is speech; the music-grade default wastes phone uplink.
      audioPreset: { maxBitrate: 24_000 },
      dtx: true,
    });
  }

  if (options.videoEl) videoTrack.attach(options.videoEl);

  return {
    room,
    /** Mutes in place — re-capturing would drop and re-negotiate the track. */
    setMicEnabled: async (enabled: boolean) => {
      if (audioTrack) {
        await (enabled ? audioTrack.unmute() : audioTrack.mute());
        return;
      }
      if (enabled) {
        audioTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
        await room.localParticipant.publishTrack(audioTrack, {
          audioPreset: { maxBitrate: 24_000 },
          dtx: true,
        });
      }
    },
    stop: async () => {
      videoTrack.stop();
      audioTrack?.stop();
      await room.disconnect();
    },
  };
}
