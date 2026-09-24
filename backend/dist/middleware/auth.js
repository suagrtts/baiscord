import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Permissions, hasPermission } from "../utils/permissions.js";
const JWT_SECRET = process.env.JWT_SECRET || "discord_super_secret_jwt_key_2026";
// In-memory user store for instant lightweight auth without external DB dependencies
export const usersDb = new Map();
// Seed default Admin & Developer users
const defaultPasswordHash = bcrypt.hashSync("password123", 10);
usersDb.set("admin@discord.local", {
    passwordHash: defaultPasswordHash,
    user: {
        id: "u-1",
        username: "TechLead",
        email: "admin@discord.local",
        discriminator: "0001",
        permissions: Permissions.ADMINISTRATOR, // Full authorization
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
// Authentication Middleware: Verifies JWT token
export function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        res.status(401).json({ error: "Access token required" });
        return;
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err || !decoded) {
            res.status(403).json({ error: "Invalid or expired token" });
            return;
        }
        const payload = decoded;
        const record = Array.from(usersDb.values()).find((r) => r.user.id === payload.id);
        if (!record) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        req.user = record.user;
        next();
    });
}
// Authorization Middleware: Checks required bitwise permission
export function requirePermission(requiredPermission) {
    return (req, res, next) => {
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
export function generateToken(user) {
    return jwt.sign({
        id: user.id,
        email: user.email,
        permissions: user.permissions.toString(),
    }, JWT_SECRET, { expiresIn: "7d" });
}
