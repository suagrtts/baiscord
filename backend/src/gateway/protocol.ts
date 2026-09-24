export enum GatewayOpcode {
  DISPATCH = 0,
  HEARTBEAT = 1,
  IDENTIFY = 2,
  PRESENCE_UPDATE = 3,
  VOICE_STATE_UPDATE = 4,
  VOICE_SIGNAL = 5,
  RESUME = 6,
  RECONNECT = 7,
  REQUEST_GUILD_MEMBERS = 8,
  INVALID_SESSION = 9,
  HELLO = 10,
  HEARTBEAT_ACK = 11,
}

export enum GatewayEvent {
  READY = "READY",
  RESUMED = "RESUMED",
  MESSAGE_CREATE = "MESSAGE_CREATE",
  MESSAGE_UPDATE = "MESSAGE_UPDATE",
  MESSAGE_DELETE = "MESSAGE_DELETE",
  CHANNEL_CREATE = "CHANNEL_CREATE",
  CHANNEL_UPDATE = "CHANNEL_UPDATE",
  CHANNEL_DELETE = "CHANNEL_DELETE",
  GUILD_CREATE = "GUILD_CREATE",
  GUILD_UPDATE = "GUILD_UPDATE",
  GUILD_DELETE = "GUILD_DELETE",
  GUILD_MEMBER_ADD = "GUILD_MEMBER_ADD",
  GUILD_MEMBER_REMOVE = "GUILD_MEMBER_REMOVE",
  PRESENCE_UPDATE = "PRESENCE_UPDATE",
  TYPING_START = "TYPING_START",
  VOICE_STATE_UPDATE = "VOICE_STATE_UPDATE",
  VOICE_SERVER_UPDATE = "VOICE_SERVER_UPDATE",
  VOICE_SIGNAL = "VOICE_SIGNAL",
}

export interface GatewayPayload<T = unknown> {
  op: GatewayOpcode;
  d?: T;
  s?: number; // Sequence number for Opcode 0
  t?: string; // Event name for Opcode 0
}

export interface IdentifyPayload {
  token: string;
  properties: {
    os: string;
    browser: string;
    device: string;
  };
}

export interface HelloPayload {
  heartbeat_interval: number;
}
