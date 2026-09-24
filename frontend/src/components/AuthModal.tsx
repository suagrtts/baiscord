"use client";

import React, { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { X, Lock, Mail, User } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isRequired?: boolean;
}

export function AuthModal({ isOpen, onClose, isRequired = false }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { setMyUserId, upsertUser, setIsAuthenticated } = useAppStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const rawApiBase =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const apiBase = rawApiBase.replace(/\/+$/, "");
    const endpoint = isRegister
      ? `${apiBase}/api/auth/register`
      : `${apiBase}/api/auth/login`;

    const body = isRegister
      ? { username, email, password }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get("content-type") || "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Endpoint not found (404) at ${endpoint}. Please verify your backend server.`);
          } else if (res.status === 502 || res.status === 503) {
            throw new Error("Backend server is starting up or temporarily sleeping on Render (free tier cold start). Please wait 20 seconds and try again.");
          } else {
            throw new Error(text.slice(0, 100) || `Request failed with HTTP status ${res.status}`);
          }
        }
      }

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      // Store JWT token locally
      localStorage.setItem("discord_token", data.token);

      // Update store with authenticated user
      const user = data.user;
      setMyUserId(user.id);
      setIsAuthenticated(true);
      upsertUser({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        bannerColor: "#5865F2",
        status: "online",
        customStatus: "Logged in via Account",
        bio: `Member since ${new Date().getFullYear()}`,
        roles: [
          {
            id: "r-auth",
            name: user.permissions === "8" ? "Admin" : "Member",
            color: user.permissions === "8" ? "#e91e63" : "#3498db",
          },
        ],
      });

      if (onClose) onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={() => {
        if (!isRequired && onClose) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-lg bg-[#313338] text-white p-6 shadow-2xl border border-[#232428] relative"
      >
        {!isRequired && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
          >
            <X size={20} />
          </button>
        )}

        <div className="text-center mb-5">
          <h2 className="text-2xl font-bold">
            {isRegister ? "Create an account" : "Welcome back!"}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {isRegister
              ? "Join your friends and communities on Discord"
              : "We're so excited to see you again!"}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex bg-[#1e1f22] p-1 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
              !isRegister
                ? "bg-[#5865F2] text-white shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
              isRegister
                ? "bg-[#5865F2] text-white shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded bg-red-500/20 border border-red-500/40 p-2.5 text-xs text-red-200 flex flex-col gap-1">
            <span>{error}</span>
            {error.toLowerCase().includes("already registered") && (
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setError(null);
                }}
                className="text-left font-semibold text-[#00a8fc] hover:underline mt-1"
              >
                👉 Click here to Log In with this email instead
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-1">
                Username <span className="text-red-400">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#1e1f22] rounded p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
                  placeholder="CoolGamer123"
                />
                <User size={16} className="absolute right-3 text-gray-500" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#1e1f22] rounded p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
                placeholder="you@example.com"
              />
              <Mail size={16} className="absolute right-3 text-gray-500" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-1">
              Password <span className="text-red-400">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#1e1f22] rounded p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
                placeholder="••••••••"
              />
              <Lock size={16} className="absolute right-3 text-gray-500" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded bg-[#5865F2] hover:bg-[#4752c4] text-white text-sm font-semibold transition disabled:opacity-50"
          >
            {loading ? "Processing..." : isRegister ? "Continue" : "Log In"}
          </button>
        </form>

        <div className="mt-4 text-xs text-gray-400">
          {isRegister ? (
            <span>
              Already have an account?{" "}
              <button
                onClick={() => setIsRegister(false)}
                className="text-[#00a8fc] hover:underline"
              >
                Log In
              </button>
            </span>
          ) : (
            <span>
              Need an account?{" "}
              <button
                onClick={() => setIsRegister(true)}
                className="text-[#00a8fc] hover:underline"
              >
                Register
              </button>
            </span>
          )}
        </div>

        {/* Quick Demo Logins Helper */}
        <div className="mt-4 pt-3 border-t border-[#3f4147] text-[11px] text-gray-400 flex items-center justify-between">
          <span>Demo Accounts (password: password123):</span>
          <div className="space-x-2">
            <button
              type="button"
              onClick={() => {
                setEmail("admin@discord.local");
                setPassword("password123");
                setIsRegister(false);
              }}
              className="text-[#00a8fc] hover:underline"
            >
              Admin
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setEmail("dev@discord.local");
                setPassword("password123");
                setIsRegister(false);
              }}
              className="text-[#00a8fc] hover:underline"
            >
              Member
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
