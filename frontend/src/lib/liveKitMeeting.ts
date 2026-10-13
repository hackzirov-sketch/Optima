/**
 * Meeting media through a LiveKit SFU (see backend MeetingLiveKitService).
 *
 * The peer-to-peer mesh holds up on one network and falls apart across
 * countries: every participant uploads a full copy to every other one,
 * nothing adapts to a slow link, and carrier-grade NAT on mobile networks
 * leaves calls stuck on "connecting" without a relay. Here each participant
 * uploads once; the SFU forwards to each viewer the simulcast layer their
 * link can carry and relays over TURN (UDP or TLS/443) where needed.
 *
 * The meeting page keeps its own state shape — roster from the socket,
 * one MediaStream per remote user, audio/video/screen flags — so this class
 * only translates LiveKit events into those updates.
 */
import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  VideoQuality,
} from "livekit-client";

export type RemoteVideoQuality = "low" | "medium" | "high";
const QUALITY: Record<RemoteVideoQuality, VideoQuality> = {
  low: VideoQuality.LOW,
  medium: VideoQuality.MEDIUM,
  high: VideoQuality.HIGH,
};

export type MediaFlags = { audio: boolean; video: boolean; screen: boolean };
export type LiveKitState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface LiveKitHandlers {
  /** A remote user's current media; `stream` is null once they have nothing published. */
  onRemote(userId: string, stream: MediaStream | null, media: MediaFlags): void;
  onState(state: LiveKitState): void;
  onData(fromUserId: string, text: string): void;
  /** Who is talking, loudest first — measured by the SFU, so the browser runs no audio analysis. */
  onSpeakers?(userIds: string[]): void;
  /** The session ended for good (kicked, room closed, duplicate identity). */
  onDisconnected?(reason?: DisconnectReason): void;
}

const CHAT_TOPIC = "meeting-chat";

/**
 * Publishing profile for unreliable links. Audio is protected first — RED
 * (redundant packets) and DTX — and video degrades by resolution through
 * simulcast layers the SFU picks per viewer. Screen shares keep resolution
 * (text has to stay legible) and drop frame rate instead.
 */
const PUBLISH_DEFAULTS = {
  simulcast: true,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  videoEncoding: { ...VideoPresets.h720.encoding, priority: "medium" as RTCPriorityType },
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  // 48 kbps (speech was 24): clearer voices, still small next to any video.
  audioPreset: AudioPresets.music,
  red: true,
  // DTX stops sending in "silence"; with background noise it clipped the
  // starts of words and made speech choppy. Off — RED covers packet loss.
  dtx: false,
  degradationPreference: "maintain-framerate" as RTCDegradationPreference,
};

export class LiveKitMeeting {
  readonly room: Room;
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();
  private closed = false;
  /** Simulcast layer wanted per remote user's camera — see setRemoteVideoQuality. */
  private readonly wanted = new Map<string, RemoteVideoQuality>();

  constructor(private readonly handlers: LiveKitHandlers) {
    this.room = new Room({
      // The page renders its own <video> elements, which adaptiveStream can't
      // observe — it would pause tracks it believes are hidden. Layer
      // selection is still adaptive: the SFU's congestion control picks each
      // subscriber's layer from their measured bandwidth.
      adaptiveStream: false,
      dynacast: true,
      publishDefaults: PUBLISH_DEFAULTS,
      // The page leaves the meeting itself (and tells the socket why).
      disconnectOnPageLeave: false,
    });

    const refresh = (participant: Participant) => {
      if (participant.isLocal) return;
      this.emitRemote(participant as RemoteParticipant);
    };
    this.room
      .on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => {
        this.applyQuality(participant.identity);
        refresh(participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => refresh(participant))
      .on(RoomEvent.TrackMuted, (_pub, participant) => refresh(participant))
      .on(RoomEvent.TrackUnmuted, (_pub, participant) => refresh(participant))
      .on(RoomEvent.TrackPublished, (_pub, participant) => refresh(participant))
      .on(RoomEvent.TrackUnpublished, (_pub, participant) => refresh(participant))
      .on(RoomEvent.ParticipantDisconnected, (participant) =>
        this.handlers.onRemote(participant.identity, null, { audio: false, video: false, screen: false }))
      .on(RoomEvent.ConnectionStateChanged, (state) => this.handlers.onState(mapState(state)))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => this.handlers.onSpeakers?.(speakers.map((speaker) => speaker.identity)))
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== CHAT_TOPIC || !participant) return;
        this.handlers.onData(participant.identity, this.dec.decode(payload));
      })
      .on(RoomEvent.Disconnected, (reason) => {
        if (this.closed) return;
        this.handlers.onState("disconnected");
        this.handlers.onDisconnected?.(reason);
      });
  }

  /** Joins the room and publishes whatever local tracks the page already holds. */
  async connect(url: string, token: string, tracks: MediaStreamTrack[]) {
    this.handlers.onState("connecting");
    await this.room.connect(url, token, { autoSubscribe: true });
    for (const track of tracks) await this.publish(track);
    // Anyone already in the room before us.
    for (const participant of this.room.remoteParticipants.values()) this.emitRemote(participant);
  }

  /** Publishes a camera/mic track (or a screen track with `screen`), keeping its current enabled state. */
  async publish(track: MediaStreamTrack, screen = false) {
    const source = screen
      ? Track.Source.ScreenShare
      : track.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera;
    const existing = this.room.localParticipant.getTrackPublication(source);
    if (existing?.track?.mediaStreamTrack === track) return existing;
    if (existing?.track) await this.room.localParticipant.unpublishTrack(existing.track, false);
    const enabled = track.enabled;
    const publication = await this.room.localParticipant.publishTrack(track, {
      source,
      ...(track.kind === "audio" ? {} : screen ? { simulcast: false } : {}),
    });
    if (!enabled) await publication.mute();
    return publication;
  }

  async unpublish(track: MediaStreamTrack) {
    await this.room.localParticipant.unpublishTrack(track, false).catch(() => undefined);
  }

  /** Mute/unmute (and stop sending) the local camera or microphone. */
  async setEnabled(kind: "audio" | "video", enabled: boolean) {
    const publication: LocalTrackPublication | undefined = this.room.localParticipant.getTrackPublication(
      kind === "audio" ? Track.Source.Microphone : Track.Source.Camera,
    );
    if (!publication) return;
    if (enabled) await publication.unmute();
    else await publication.mute();
  }

  /** Meeting chat over the SFU's reliable data channel; returns how many peers it reached. */
  sendChat(payload: string): number {
    const recipients = this.room.remoteParticipants.size;
    if (!recipients || this.room.state !== ConnectionState.Connected) return 0;
    void this.room.localParticipant.publishData(this.enc.encode(payload), { reliable: true, topic: CHAT_TOPIC });
    return recipients;
  }

  /**
   * Which camera layer to receive from a remote user, by how big the page
   * shows them. adaptiveStream (which does this from element size) is off
   * because the page owns its <video> elements, so without this every viewer
   * pulled every camera at 720p — N-1 full streams per person, which is what
   * froze calls of three or more on slower links.
   */
  setRemoteVideoQuality(userId: string, quality: RemoteVideoQuality) {
    if (this.wanted.get(userId) === quality) return;
    this.wanted.set(userId, quality);
    this.applyQuality(userId);
  }

  private applyQuality(userId: string) {
    const quality = this.wanted.get(userId);
    const camera = this.room.remoteParticipants.get(userId)?.getTrackPublication(Track.Source.Camera);
    if (quality && camera) camera.setVideoQuality(QUALITY[quality]);
  }

  get remoteCount() {
    return this.room.remoteParticipants.size;
  }

  async disconnect() {
    this.closed = true;
    await this.room.disconnect(false).catch(() => undefined);
  }

  /**
   * One stream per remote user, the shape the page renders: their microphone
   * plus one video — the screen share when there is one (as with the P2P
   * path, where a share replaces the camera), the camera otherwise.
   */
  private emitRemote(participant: RemoteParticipant) {
    const pick = (source: Track.Source) => {
      const publication = participant.getTrackPublication(source);
      return publication?.isSubscribed && publication.track ? publication : undefined;
    };
    const mic = pick(Track.Source.Microphone);
    const camera = pick(Track.Source.Camera);
    const screen = pick(Track.Source.ScreenShare);
    const video = screen ?? (camera && !camera.isMuted ? camera : undefined);
    const tracks = [mic?.track?.mediaStreamTrack, video?.track?.mediaStreamTrack].filter(
      (track): track is MediaStreamTrack => Boolean(track),
    );
    this.handlers.onRemote(participant.identity, tracks.length ? new MediaStream(tracks) : null, {
      audio: Boolean(mic && !mic.isMuted),
      video: Boolean(video),
      screen: Boolean(screen),
    });
  }
}

function mapState(state: ConnectionState): LiveKitState {
  switch (state) {
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return "reconnecting";
    case ConnectionState.Connecting:
      return "connecting";
    default:
      return "disconnected";
  }
}
