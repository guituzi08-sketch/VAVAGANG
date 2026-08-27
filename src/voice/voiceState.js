export const CALL_STATES = Object.freeze({
  IDLE: "idle",
  REQUESTING_MEDIA: "requesting-media",
  MEDIA_READY: "media-ready",
  JOINING: "joining",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  LEAVING: "leaving",
  ENDED: "ended",
  FAILED: "failed",
});

export const PEER_STATES = Object.freeze({
  NEW: "new",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  FAILED: "failed",
  CLOSED: "closed",
});
