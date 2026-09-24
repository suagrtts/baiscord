"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAppStore, UserProfile } from "@/store/useAppStore";
import { useVoiceClient } from "@/hooks/useVoiceClient";
import { UserProfileModal } from "@/components/UserProfileModal";
import { AuthModal } from "@/components/AuthModal";
import {
  Hash,
  Volume2,
  Plus,
  Compass,
  Bell,
  Pin,
  Users,
  Search,
  Inbox,
  HelpCircle,
  Smile,
  Send,
  Mic,
  MicOff,
  Headphones,
  Settings,
  Circle,
  PhoneOff,
  Radio,
  LogIn,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export default function DiscordApp() {
  const {
    myUserId,
    isAuthenticated,
    setIsAuthenticated,
    logout,
    users,
    selectedUserProfile,
    setSelectedUserProfile,
    upsertUser,
    guilds,
    currentGuildId,
    currentChannelId,
    messages,
    connected,
    voice,
    setCurrentGuild,
    setCurrentChannel,
    addMessage,
    setConnected,
    setMyUserId,
    toggleMute,
    toggleDeafen,
  } = useAppStore();

  const [inputMessage, setInputMessage] = useState("");
  const [showMemberList, setShowMemberList] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { joinVoiceChannel, leaveVoiceChannel, handleVoiceGatewayEvent } =
    useVoiceClient(wsRef);

  const activeGuild = guilds.find((g) => g.id === currentGuildId) || guilds[0];
  const activeChannel =
    activeGuild?.channels.find((c) => c.id === currentChannelId) ||
    activeGuild?.channels[0];
  const currentMessages = (activeChannel && messages[activeChannel.id]) || [];

  // 1. Check existing authentication on mount
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("discord_token") : null;
    if (!token) {
      setIsAuthenticated(false);
      setShowAuthModal(true);
      setAuthChecked(true);
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token expired");
        return res.json();
      })
      .then((data) => {
        const user = data.user;
        setMyUserId(user.id);
        setIsAuthenticated(true);
        upsertUser({
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`,
          bannerColor: "#5865F2",
          status: "online",
          customStatus: "Logged in",
          bio: `Member since ${new Date().getFullYear()}`,
          roles: [
            {
              id: "r-auth",
              name: user.permissions === "8" ? "Admin" : "Member",
              color: user.permissions === "8" ? "#e91e63" : "#3498db",
            },
          ],
        });
      })
      .catch(() => {
        localStorage.removeItem("discord_token");
        setIsAuthenticated(false);
        setShowAuthModal(true);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, [setIsAuthenticated, setMyUserId, upsertUser]);

  // 2. Connect to the Realtime Gateway WebSocket once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const gatewayUrl =
      process.env.NEXT_PUBLIC_GATEWAY_URL ||
      (typeof window !== "undefined" && window.location.hostname !== "localhost"
        ? `wss://${window.location.host}`
        : "ws://localhost:3001");

    const token = typeof window !== "undefined" ? localStorage.getItem("discord_token") : "";
    const ws = new WebSocket(gatewayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send IDENTIFY opcode with user ID and token
      ws.send(
        JSON.stringify({
          op: 2,
          d: {
            token: token || "sample-auth-token",
            userId: myUserId,
            properties: { os: "web", browser: "react", device: "desktop" },
          },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.op === 10) {
          // Heartbeat Hello
          const interval = payload.d.heartbeat_interval || 41250;
          const timer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ op: 1 }));
            }
          }, interval);
          return () => clearInterval(timer);
        }

        if (payload.op === 0) {
          // Handle voice-related events (VOICE_SERVER_UPDATE, VOICE_STATE_UPDATE, VOICE_SIGNAL)
          if (
            payload.t === "VOICE_SERVER_UPDATE" ||
            payload.t === "VOICE_STATE_UPDATE" ||
            payload.t === "VOICE_SIGNAL"
          ) {
            handleVoiceGatewayEvent(payload);
          }
        }
      } catch (err) {
        console.error("Gateway parse error:", err);
      }
    };

    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [handleVoiceGatewayEvent, isAuthenticated, myUserId, setConnected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeChannel) return;

    const newMessage = {
      id: "msg-" + Date.now(),
      author: {
        id: myUserId,
        username: "You (" + myUserId.slice(-4) + ")",
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${myUserId}`,
      },
      content: inputMessage,
      timestamp:
        "Today at " +
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    addMessage(activeChannel.id, newMessage);
    setInputMessage("");
  };

  const handleChannelClick = (channel: { id: string; type: "text" | "voice" }) => {
    if (channel.type === "voice") {
      if (voice.currentVoiceChannelId === channel.id) {
        return;
      }
      joinVoiceChannel(channel.id);
    } else {
      setCurrentChannel(channel.id);
    }
    // Auto-close mobile drawer upon selecting a channel
    setShowMobileSidebar(false);
  };

  const currentVoiceChannel = activeGuild?.channels.find(
    (c) => c.id === voice.currentVoiceChannelId
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#313338] text-gray-200 select-none relative">
      {/* Mobile Backdrop for Navigation Drawer */}
      {showMobileSidebar && (
        <div
          onClick={() => setShowMobileSidebar(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* 1. Server Sidebar & Channels Sidebar Container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex h-full transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          showMobileSidebar ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* 1. Server Sidebar */}
        <div className="flex flex-col items-center py-3 w-[72px] bg-[#1e1f22] space-y-2 flex-shrink-0 z-20">
          <div
            onClick={() => {
              setCurrentGuild("1");
              setShowMobileSidebar(false);
            }}
            className="relative group flex items-center justify-center w-12 h-12 rounded-3xl hover:rounded-2xl bg-[#5865F2] text-white font-bold transition-all duration-200 cursor-pointer"
          >
            <span className="text-xl">D</span>
          </div>

          <div className="w-8 h-[2px] bg-[#35363c] rounded-full my-1" />

          {guilds.map((guild) => {
            const isActive = guild.id === currentGuildId;
            return (
              <div
                key={guild.id}
                onClick={() => setCurrentGuild(guild.id)}
                className="relative group flex items-center justify-center cursor-pointer"
              >
                <div
                  className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                    isActive
                      ? "h-10"
                      : "h-2 group-hover:h-5 opacity-0 group-hover:opacity-100"
                  }`}
                />
                <div
                  className={`flex items-center justify-center w-12 h-12 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? "rounded-2xl bg-[#5865F2] text-white"
                      : "rounded-3xl hover:rounded-2xl bg-[#313338] text-gray-300 hover:bg-[#5865F2] hover:text-white"
                  }`}
                >
                  {guild.name.substring(0, 2).toUpperCase()}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-center w-12 h-12 rounded-3xl hover:rounded-2xl bg-[#313338] hover:bg-[#23a55a] text-[#23a55a] hover:text-white transition-all duration-200 cursor-pointer">
            <Plus size={24} />
          </div>
          <div className="flex items-center justify-center w-12 h-12 rounded-3xl hover:rounded-2xl bg-[#313338] hover:bg-[#23a55a] text-[#23a55a] hover:text-white transition-all duration-200 cursor-pointer">
            <Compass size={24} />
          </div>
        </div>

        {/* 2. Channels Sidebar */}
        <div className="flex flex-col w-60 bg-[#2b2d31] border-r border-[#1f2023]/40 flex-shrink-0">
        {/* Guild Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-[#1f2023] font-semibold text-white shadow-sm">
          <span className="truncate">{activeGuild?.name}</span>
          <div className="flex items-center space-x-1">
            <Circle
              size={10}
              className={`fill-current ${
                connected ? "text-green-500" : "text-amber-500"
              }`}
            />
          </div>
        </div>

        {/* Channels List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-[2px]">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">
            Channels
          </div>
          {activeGuild?.channels.map((channel) => {
            const isTextActive =
              channel.type === "text" && channel.id === currentChannelId;
            const isVoiceActive =
              channel.type === "voice" &&
              voice.currentVoiceChannelId === channel.id;

            return (
              <div key={channel.id} className="flex flex-col">
                <div
                  onClick={() => handleChannelClick(channel)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors group ${
                    isTextActive || isVoiceActive
                      ? "bg-[#404249] text-white"
                      : "text-gray-400 hover:bg-[#35373c] hover:text-gray-200"
                  }`}
                >
                  <div className="flex items-center truncate">
                    {channel.type === "text" ? (
                      <Hash
                        size={18}
                        className="mr-2 text-gray-400 group-hover:text-gray-200 flex-shrink-0"
                      />
                    ) : (
                      <Volume2
                        size={18}
                        className={`mr-2 flex-shrink-0 ${
                          isVoiceActive
                            ? "text-green-400"
                            : "text-gray-400 group-hover:text-gray-200"
                        }`}
                      />
                    )}
                    <span className="text-sm font-medium truncate">
                      {channel.name}
                    </span>
                  </div>

                  {channel.type === "voice" && isVoiceActive && (
                    <Radio size={14} className="text-green-400 animate-pulse" />
                  )}
                </div>

                {/* Voice Channel Connected Members */}
                {channel.type === "voice" && (
                  <div className="pl-6 pr-2 py-0.5 space-y-1">
                    {(voice.channelMembers[channel.id] || []).map((memberId) => {
                      const isMe = memberId === myUserId;
                      const memberUser = users[memberId];
                      const memberName = isMe ? "You" : memberUser?.username || `User (${memberId.slice(-4)})`;
                      const memberAvatar = memberUser?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${memberId}`;
                      const isSpeaking = voice.speakingUsers.has(memberId);

                      return (
                        <div key={memberId} className="flex items-center space-x-2 py-0.5">
                          <div
                            className={`w-6 h-6 rounded-full border-2 overflow-hidden flex items-center justify-center transition-colors ${
                              isSpeaking
                                ? "border-green-400 bg-green-500/20"
                                : "border-transparent bg-slate-700"
                            }`}
                          >
                            <img
                              src={memberAvatar}
                              alt={memberName}
                              className="w-full h-full"
                            />
                          </div>
                          <span className="text-xs text-gray-200 truncate">
                            {memberName} {isMe && voice.isMuted && "(Muted)"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Connected Voice Status Box */}
        {voice.currentVoiceChannelId && (
          <div className="px-3 py-2 bg-[#232428] border-b border-[#1f2023] flex items-center justify-between">
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-green-400 flex items-center space-x-1">
                <Radio size={12} className="mr-1 animate-pulse" /> Voice Connected
              </span>
              <span className="text-[11px] text-gray-400 truncate">
                {currentVoiceChannel?.name}
              </span>
            </div>
            <button
              onClick={leaveVoiceChannel}
              title="Disconnect"
              className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-md transition-colors"
            >
              <PhoneOff size={16} />
            </button>
          </div>
        )}

        {/* User Status Bar */}
        <div className="flex items-center justify-between px-2 h-[52px] bg-[#232428]">
          <div className="flex items-center space-x-2 truncate">
            <div className="relative flex-shrink-0">
              <img
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${myUserId}`}
                alt="Avatar"
                className="w-8 h-8 rounded-full bg-indigo-600"
              />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#232428] rounded-full" />
            </div>
            <div className="flex flex-col text-left truncate">
              <span className="text-sm font-semibold text-white leading-tight truncate">
                You ({myUserId.slice(-4)})
              </span>
              <span className="text-[11px] text-gray-400 leading-tight">
                Online
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-1 text-gray-400 flex-shrink-0">
            <button
              onClick={toggleMute}
              className={`p-1 rounded transition-colors ${
                voice.isMuted
                  ? "bg-red-500/20 text-red-400"
                  : "hover:bg-[#35373c] hover:text-gray-200"
              }`}
              title={voice.isMuted ? "Unmute" : "Mute"}
            >
              {voice.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={toggleDeafen}
              className={`p-1 rounded transition-colors ${
                voice.isDeafened
                  ? "bg-red-500/20 text-red-400"
                  : "hover:bg-[#35373c] hover:text-gray-200"
              }`}
              title={voice.isDeafened ? "Undeafen" : "Deafen"}
            >
              <Headphones size={18} />
            </button>
            {isAuthenticated ? (
              <button
                onClick={logout}
                title="Log Out"
                className="p-1 hover:bg-[#35373c] hover:text-red-400 rounded transition-colors"
              >
                <LogOut size={18} />
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                title="Account / Log In"
                className="p-1 hover:bg-[#35373c] hover:text-[#5865F2] rounded transition-colors"
              >
                <LogIn size={18} />
              </button>
            )}
            <button className="p-1 hover:bg-[#35373c] hover:text-gray-200 rounded">
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* 3. Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#313338] h-full w-full min-w-0">
        {/* Chat Top Bar */}
        <div className="flex items-center justify-between px-3 md:px-4 h-12 border-b border-[#1f2023] shadow-sm bg-[#313338]">
          <div className="flex items-center space-x-2 min-w-0">
            {/* Mobile Hamburger Drawer Toggle */}
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-1 -ml-1 text-gray-300 hover:text-white md:hidden rounded hover:bg-[#35373c] transition-colors"
              title="Open Navigation"
            >
              <Menu size={22} />
            </button>
            <Hash size={22} className="text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-white truncate text-sm md:text-base">
              {activeChannel?.name}
            </span>
          </div>
          <div className="flex items-center space-x-2 md:space-x-4 text-gray-400 flex-shrink-0">
            <Bell size={20} className="hidden sm:block hover:text-gray-200 cursor-pointer" />
            <Pin size={20} className="hidden sm:block hover:text-gray-200 cursor-pointer" />
            <Users
              size={20}
              onClick={() => setShowMemberList(!showMemberList)}
              className={`cursor-pointer transition-colors ${
                showMemberList ? "text-white" : "hover:text-gray-200"
              }`}
            />
            <div className="relative hidden md:flex items-center">
              <input
                type="text"
                placeholder="Search"
                className="bg-[#1e1f22] text-sm text-gray-200 rounded px-2 py-1 pr-6 focus:outline-none w-36"
              />
              <Search size={14} className="absolute right-2 text-gray-400" />
            </div>
            <Inbox size={20} className="hidden sm:block hover:text-gray-200 cursor-pointer" />
            <HelpCircle size={20} className="hidden sm:block hover:text-gray-200 cursor-pointer" />
          </div>
        </div>

        {/* Content Body: Chat Feed + Member List */}
        <div className="flex-1 flex overflow-hidden">
          {/* Messages Feed */}
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div className="mt-8 mb-4">
                <div className="w-16 h-16 rounded-full bg-[#404249] flex items-center justify-center mb-2">
                  <Hash size={40} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white">
                  Welcome to #{activeChannel?.name}!
                </h2>
                <p className="text-sm text-gray-400">
                  This is the start of the #{activeChannel?.name} channel.
                </p>
              </div>

              <div className="w-full h-[1px] bg-[#3f4147]" />

              {currentMessages.map((msg) => {
                const userProfile = users[msg.author.id];
                return (
                  <div
                    key={msg.id}
                    className="flex space-x-4 group hover:bg-[#2e3035] -mx-4 px-4 py-1.5 rounded transition-colors"
                  >
                    <img
                      src={userProfile?.avatar || msg.author.avatar}
                      alt={msg.author.username}
                      onClick={() => {
                        if (userProfile) setSelectedUserProfile(userProfile);
                      }}
                      className="w-10 h-10 rounded-full bg-slate-700 flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-85 transition"
                    />
                    <div className="flex-1">
                      <div className="flex items-baseline space-x-2">
                        <span
                          onClick={() => {
                            if (userProfile) setSelectedUserProfile(userProfile);
                          }}
                          className="font-semibold text-white hover:underline cursor-pointer"
                        >
                          {userProfile?.username || msg.author.username}
                        </span>
                        <span className="text-xs text-gray-400">{msg.timestamp}</span>
                      </div>
                      <p className="text-sm text-gray-200 mt-1 leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Box */}
            <div className="px-2 sm:px-4 pb-3 sm:pb-6 pt-1">
              <form
                onSubmit={handleSendMessage}
                className="relative flex items-center bg-[#383a40] rounded-lg px-3 py-2 sm:px-4 sm:py-2.5"
              >
                <button
                  type="button"
                  className="p-1.5 rounded-full bg-[#4e5058] hover:bg-[#6d6f78] text-white mr-2 sm:mr-3 flex-shrink-0"
                >
                  <Plus size={16} />
                </button>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Message #${activeChannel?.name || "channel"}`}
                  className="bg-transparent flex-1 focus:outline-none text-sm text-white placeholder-gray-500 min-w-0"
                />
                <div className="flex items-center space-x-2 text-gray-400 ml-2">
                  <Smile size={20} className="hover:text-gray-200 cursor-pointer" />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim()}
                    className={`p-1 rounded ${
                      inputMessage.trim()
                        ? "text-[#5865F2] hover:text-indigo-400"
                        : "text-gray-500"
                    }`}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Member List Sidebar */}
          {showMemberList && (
            <>
              {/* Mobile Backdrop for Member List */}
              <div
                onClick={() => setShowMemberList(false)}
                className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-xs transition-opacity"
              />

              <div className="fixed inset-y-0 right-0 z-50 w-64 bg-[#2b2d31] border-l border-[#1f2023]/40 p-3 overflow-y-auto space-y-4 shadow-2xl md:static md:w-60 md:shadow-none transition-transform">
                <div className="flex items-center justify-between px-2 md:hidden pb-2 border-b border-[#1f2023]">
                  <span className="text-xs font-bold uppercase text-gray-300">Members</span>
                  <button
                    onClick={() => setShowMemberList(false)}
                    className="p-1 text-gray-400 hover:text-white rounded"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-2">
                    Online — {Object.keys(users).length}
                  </span>
                  <div className="mt-2 space-y-1">
                    {Object.values(users).map((user) => (
                      <div
                        key={user.id}
                        onClick={() => {
                          setSelectedUserProfile(user);
                          setShowMemberList(false);
                        }}
                        className="flex items-center space-x-3 px-2 py-1.5 rounded-md hover:bg-[#35373c] cursor-pointer group transition-colors"
                      >
                        <div className="relative flex-shrink-0">
                          <img
                            src={user.avatar}
                            alt={user.username}
                            className="w-8 h-8 rounded-full bg-slate-700"
                          />
                          <div
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#2b2d31] ${
                              user.status === "online"
                                ? "bg-green-500"
                                : user.status === "idle"
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                          />
                        </div>
                        <div className="flex flex-col text-left truncate">
                          <span className="text-sm font-medium text-gray-300 group-hover:text-white truncate">
                            {user.username}
                          </span>
                          {user.customStatus && (
                            <span className="text-[11px] text-gray-400 truncate">
                              {user.customStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4. Discord User Profile Modal */}
      {selectedUserProfile && (
        <UserProfileModal
          user={selectedUserProfile}
          onClose={() => setSelectedUserProfile(null)}
        />
      )}

      {/* 5. Authentication & Authorization Modal */}
      <AuthModal
        isOpen={showAuthModal || (!isAuthenticated && authChecked)}
        isRequired={!isAuthenticated}
        onClose={() => {
          if (isAuthenticated) setShowAuthModal(false);
        }}
      />
    </div>
  );
}
