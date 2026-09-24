"use client";

import React from "react";
import { UserProfile, useAppStore } from "@/store/useAppStore";
import { X, ShieldCheck, MessageSquare, Volume2 } from "lucide-react";

interface UserProfileModalProps {
  user: UserProfile;
  onClose: () => void;
}

export function UserProfileModal({ user, onClose }: UserProfileModalProps) {
  const { setCurrentChannel, currentGuildId, guilds } = useAppStore();

  const getStatusColor = (status: UserProfile["status"]) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "idle":
        return "bg-amber-500";
      case "dnd":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-[#232428] text-white shadow-2xl border border-[#313338]"
      >
        {/* Banner */}
        <div
          className="relative h-28 w-full"
          style={{ backgroundColor: user.bannerColor || "#5865F2" }}
        >
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-gray-200 hover:bg-black/60 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Avatar & Badges */}
        <div className="relative px-4 pb-4">
          <div className="relative -mt-12 mb-3 inline-block">
            <div className="relative h-20 w-20 rounded-full border-[6px] border-[#232428] bg-slate-800 overflow-hidden shadow-lg">
              <img
                src={user.avatar}
                alt={user.username}
                className="h-full w-full object-cover"
              />
            </div>
            {/* Status Indicator */}
            <div
              className={`absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-4 border-[#232428] ${getStatusColor(
                user.status
              )}`}
            />
          </div>

          {/* User Info Container */}
          <div className="rounded-xl bg-[#111214] p-3.5 space-y-3">
            <div>
              <div className="flex items-center space-x-1.5">
                <h3 className="text-lg font-bold leading-tight">{user.username}</h3>
                <span className="text-xs text-gray-400">#{user.discriminator}</span>
              </div>
              {user.customStatus && (
                <p className="mt-1 text-xs text-gray-300 italic">
                  {user.customStatus}
                </p>
              )}
            </div>

            <div className="h-[1px] w-full bg-[#2b2d31]" />

            {/* About Me / Bio */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                About Me
              </span>
              <p className="mt-1 text-xs text-gray-200 leading-relaxed">
                {user.bio || "No bio specified yet."}
              </p>
            </div>

            {/* Roles */}
            {user.roles && user.roles.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Roles
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {user.roles.map((role) => (
                    <span
                      key={role.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#2b2d31] border border-white/5 space-x-1"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      <span>{role.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-1">
              <button
                onClick={() => {
                  onClose();
                  // Switch to general text channel
                  const generalChannel = guilds
                    .find((g) => g.id === currentGuildId)
                    ?.channels.find((c) => c.type === "text");
                  if (generalChannel) setCurrentChannel(generalChannel.id);
                }}
                className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold transition"
              >
                <MessageSquare size={14} />
                <span>Send Message</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
