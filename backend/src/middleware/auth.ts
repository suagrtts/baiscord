import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { defaultSnowflake } from "../utils/snowflake.js";
import { Permissions, hasPermission } from "../utils/permissions.js";

import { pool } from "../db/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "discord_super_secret_jwt_key_2026";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  discriminator: string;
  permissions: bigint;
  avatar: string;
}

// In-memory fallback user store (seeds Admin and Developer accounts)
export const usersDb = new Map<string, { user: AuthUser; passwordHash: string }>();

const defaultPasswordHash = bcrypt.hashSync("password123", 10);
usersDb.set("admin@discord.local", {
  passwordHash: defaultPasswordHash,
  user: {
    id: "u-1",
    username: "TechLead",
    email: "admin@discord.local",
    discriminator: "0001",
    permissions: Permissions.ADMINISTRATOR,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=TechLead",
  },
});

usersDb.set("dev@discord.local", {
  passwordHash: defaultPasswordHash,
  user: {
    id: "u-2",
    username: "FrontendNinja",
    email: "dev@discord.local",
    discriminator: "1337",
    permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.CONNECT | Permissions.SPEAK,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=FrontendNinja",
  },
});

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function loadUsersFromDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, "utf-8");
      const list = JSON.parse(content) as Array<{ user: AuthUser & { permissions: string }; passwordHash: string }>;
      for (const item of list) {
        usersDb.set(item.user.email.toLowerCase(), {
          user: {
            ...item.user,
            permissions: BigInt(item.user.permissions),
          },
          passwordHash: item.passwordHash,
        });
      }
      console.log(`[Auth] Loaded ${list.length} persisted user(s) from disk.`);
    }
  } catch (err) {
    console.warn("[Auth] Failed to load users from disk:", err);
  }
}

function saveUsersToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const serializable = Array.from(usersDb.values()).map((v) => ({
      passwordHash: v.passwordHash,
      user: {
        ...v.user,
        permissions: v.user.permissions.toString(),
      },
    }));
    fs.writeFileSync(USERS_FILE, JSON.stringify(serializable, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Auth] Failed to write users to disk:", err);
  }
}

loadUsersFromDisk();

export async function findUserRecordByEmail(email: string): Promise<{ user: AuthUser; passwordHash: string } | null> {
  try {
    const res = await pool.query(
      "SELECT id, username, discriminator, email, password_hash, avatar_url, permissions FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        passwordHash: row.password_hash,
        user: {
          id: row.id,
          username: row.username,
          discriminator: row.discriminator,
          email: row.email,
          permissions: BigInt(row.permissions || "0"),
          avatar: row.avatar_url,
        },
      };
    }
  } catch (err) {
    // DB not available or error, fall back to memory
  }
  return usersDb.get(email.toLowerCase()) || null;
}

export async function findUserRecordByUsername(username: string): Promise<AuthUser | null> {
  const cleanUsername = username.trim().toLowerCase();
  try {
    const res = await pool.query(
      "SELECT id, username, discriminator, email, avatar_url, permissions FROM users WHERE LOWER(username) = LOWER($1)",
      [cleanUsername]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        id: row.id,
        username: row.username,
        discriminator: row.discriminator,
        email: row.email,
        permissions: BigInt(row.permissions || "0"),
        avatar: row.avatar_url,
      };
    }
  } catch (err) {
    // DB not available, fall back to memory
  }
  const record = Array.from(usersDb.values()).find(
    (r) => r.user.username.toLowerCase() === cleanUsername
  );
  return record ? record.user : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  try {
    const res = await pool.query(
      "SELECT id, username, discriminator, email, avatar_url, permissions FROM users WHERE id = $1",
      [id]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        id: row.id,
        username: row.username,
        discriminator: row.discriminator,
        email: row.email,
        permissions: BigInt(row.permissions || "0"),
        avatar: row.avatar_url,
      };
    }
  } catch (err) {
    // DB not available, fall back to memory
  }
  const record = Array.from(usersDb.values()).find((r) => r.user.id === id);
  return record ? record.user : null;
}

export async function saveUserToDb(user: AuthUser, passwordHash: string): Promise<void> {
  // Always update in-memory map and persist to disk
  usersDb.set(user.email.toLowerCase(), { user, passwordHash });
  saveUsersToDisk();
  try {
    await pool.query(
      `INSERT INTO users (id, username, discriminator, email, password_hash, avatar_url, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, username = EXCLUDED.username`,
      [
        user.id,
        user.username,
        user.discriminator,
        user.email.toLowerCase(),
        passwordHash,
        user.avatar,
        user.permissions.toString(),
      ]
    );
  } catch (err) {
    console.warn("[DB] Could not save user to PostgreSQL, stored in-memory.", (err as Error).message);
  }
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

// Authentication Middleware: Verifies JWT token
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const user = await findUserById(decoded.id);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}

// Authorization Middleware: Checks required bitwise permission
export function requirePermission(requiredPermission: bigint) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    if (!hasPermission(req.user.permissions, requiredPermission)) {
      res.status(403).json({
        error: "Forbidden: Insufficient permissions",
        required: requiredPermission.toString(),
        userPermissions: req.user.permissions.toString(),
      });
      return;
    }

    next();
  };
}

// Helper: Generate JWT token for user
export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      permissions: user.permissions.toString(),
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}
