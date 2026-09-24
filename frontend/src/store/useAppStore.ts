import { create } from "zustand";

export interface Message {
  id: string;
  author: {
    id: string;
    username: string;
    avatar: string;
  };
  content: string;
  timestamp: string;
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
}

export interface Guild {
  id: string;
  name: string;
  icon?: string;
  channels: Channel[];
}

export interface UserProfile {
  id: string;
  username: string;
  discriminator: string;
  avatar: string;
  bannerColor: string;
  customStatus?: string;
  status: "online" | "idle" | "dnd" | "offline";
  bio?: string;
  roles: { id: string; name: string; color: string }[];
}

export interface VoiceState {
  currentVoiceChannelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  speakingUsers: Set<string>;
  channelMembers: Record<string, string[]>; // channelId -> userIds
}

interface AppState {
  myUserId: string;
  isAuthenticated: boolean;
  selectedUserProfile: UserProfile | null;
  users: Record<string, UserProfile>;
  currentGuildId: string;
  currentChannelId: string;
  guilds: Guild[];
  messages: Record<string, Message[]>;
  connected: boolean;
  voice: VoiceState;

  setCurrentGuild: (guildId: string) => void;
  setCurrentChannel: (channelId: string) => void;
  addMessage: (channelId: string, message: Message) => void;
  setConnected: (status: boolean) => void;
  setMyUserId: (userId: string) => void;
  setIsAuthenticated: (status: boolean) => void;
  setSelectedUserProfile: (profile: UserProfile | null) => void;
  upsertUser: (user: UserProfile) => void;
  setVoiceChannel: (channelId: string | null) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setSpeaking: (userId: string, isSpeaking: boolean) => void;
  updateVoiceMembers: (channelId: string, members: string[]) => void;
  setMemberVoiceChannel: (userId: string, newChannelId: string | null) => void;
  setAllVoiceStates: (voiceStates: Record<string, string[]>) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  myUserId: "u-1001",
  isAuthenticated: false,
  selectedUserProfile: null,
  users: {
    "u-1001": {
      id: "u-1001",
      username: "You",
      discriminator: "1001",
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=u-1001",
      bannerColor: "#5865F2",
      status: "online",
      customStatus: "Building Discord clone 🚀",
      bio: "Fullstack Architect & Systems Tinkerer.",
      roles: [{ id: "r1", name: "Admin", color: "#e91e63" }, { id: "r2", name: "Developer", color: "#3498db" }],
    },
    "u-1": {
      id: "u-1",
      username: "TechLead",
      discriminator: "0001",
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=TechLead",
      bannerColor: "#e67e22",
      status: "online",
      customStatus: "Reviewing WebRTC SFU PRs",
      bio: "Distributed systems enthusiast. Rust + Go + Elixir advocate.",
      roles: [{ id: "r1", name: "Admin", color: "#e91e63" }],
    },
    "u-2": {
      id: "u-2",
      username: "FrontendNinja",
      discriminator: "1337",
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=FrontendNinja",
      bannerColor: "#9b59b6",
      status: "idle",
      customStatus: "Pixel perfection in progress 🎨",
      bio: "React 19 & Tailwind CSS magician.",
      roles: [{ id: "r2", name: "Developer", color: "#3498db" }],
    },
  },
  currentGuildId: "1",
  currentChannelId: "101",
  connected: false,
  voice: {
    currentVoiceChannelId: null,
    isMuted: false,
    isDeafened: false,
    speakingUsers: new Set(),
    channelMembers: {},
  },
  guilds: [
    {
      id: "1",
      name: "Engineering Hub",
      channels: [
        { id: "101", name: "general", type: "text" },
        { id: "102", name: "backend-dev", type: "text" },
        { id: "103", name: "voice-lounge", type: "voice" },
        { id: "104", name: "gaming-room", type: "voice" },
      ],
    },
    {
      id: "2",
      name: "Gaming Lounge",
      channels: [
        { id: "201", name: "announcements", type: "text" },
        { id: "202", name: "memes", type: "text" },
        { id: "203", name: "squad-chat", type: "voice" },
      ],
    },
  ],
  messages: {
    "101": [
      {
        id: "msg-1",
        author: {
          id: "u-1",
          username: "TechLead",
          avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=TechLead",
        },
        content: "Welcome to the Discord Clone architecture hub! Gateway & Snowflake ID services are live.",
        timestamp: "Today at 2:20 PM",
      },
      {
        id: "msg-2",
        author: {
          id: "u-2",
          username: "FrontendNinja",
          avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=FrontendNinja",
        },
        content: "Next.js 15 App router + Tailwind CSS layout is set up with real-time WebSocket listening!",
        timestamp: "Today at 2:24 PM",
      },
    ],
  },
  setCurrentGuild: (guildId) =>
    set((state) => {
      const guild = state.guilds.find((g) => g.id === guildId);
      return {
        currentGuildId: guildId,
        currentChannelId: guild?.channels[0]?.id || "",
      };
    }),
  setCurrentChannel: (channelId) => set({ currentChannelId: channelId }),
  addMessage: (channelId, message) =>
    set((state) => {
      const channelMsgs = state.messages[channelId] || [];
      if (channelMsgs.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        messages: {
          ...state.messages,
          [channelId]: [...channelMsgs, message],
        },
      };
    }),
  setConnected: (status) => set({ connected: status }),
  setMyUserId: (userId) => set({ myUserId: userId }),
  setSelectedUserProfile: (profile) => set({ selectedUserProfile: profile }),
  upsertUser: (user) =>
    set((state) => ({
      users: {
        ...state.users,
        [user.id]: user,
      },
    })),
  setVoiceChannel: (channelId) =>
    set((state) => ({
      voice: {
        ...state.voice,
        currentVoiceChannelId: channelId,
      },
    })),
  toggleMute: () =>
    set((state) => ({
      voice: { ...state.voice, isMuted: !state.voice.isMuted },
    })),
  toggleDeafen: () =>
    set((state) => ({
      voice: { ...state.voice, isDeafened: !state.voice.isDeafened },
    })),
  setSpeaking: (userId, isSpeaking) =>
    set((state) => {
      const newSpeaking = new Set(state.voice.speakingUsers);
      if (isSpeaking) {
        newSpeaking.add(userId);
      } else {
        newSpeaking.delete(userId);
      }
      return { voice: { ...state.voice, speakingUsers: newSpeaking } };
    }),
  updateVoiceMembers: (channelId, members) =>
    set((state) => ({
      voice: {
        ...state.voice,
        channelMembers: {
          ...state.voice.channelMembers,
          [channelId]: members,
        },
      },
    })),
  setMemberVoiceChannel: (userId, newChannelId) =>
    set((state) => {
      const newChannelMembers: Record<string, string[]> = {};
      // 1. Remove userId from EVERY channel
      for (const [chId, members] of Object.entries(state.voice.channelMembers)) {
        newChannelMembers[chId] = members.filter((id) => id !== userId);
      }
      // 2. Add to newChannelId if specified
      if (newChannelId) {
        if (!newChannelMembers[newChannelId]) {
          newChannelMembers[newChannelId] = [];
        }
        if (!newChannelMembers[newChannelId].includes(userId)) {
          newChannelMembers[newChannelId] = [...newChannelMembers[newChannelId], userId];
        }
      }
      return {
        voice: {
          ...state.voice,
          channelMembers: newChannelMembers,
        },
      };
    }),
  setAllVoiceStates: (voiceStates) =>
    set((state) => ({
      voice: {
        ...state.voice,
        channelMembers: voiceStates,
      },
    })),
  setIsAuthenticated: (status) => set({ isAuthenticated: status }),
  logout: () => {
    localStorage.removeItem("discord_token");
    set({
      isAuthenticated: false,
      voice: {
        currentVoiceChannelId: null,
        isMuted: false,
        isDeafened: false,
        speakingUsers: new Set(),
        channelMembers: {},
      },
    });
  },
}));
