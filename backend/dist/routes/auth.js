import { Router } from "express";
import bcrypt from "bcryptjs";
import { defaultSnowflake } from "../utils/snowflake.js";
import { Permissions } from "../utils/permissions.js";
import { usersDb, generateToken, authenticateToken, requirePermission, } from "../middleware/auth.js";
export const authRouter = Router();
// POST /api/auth/register
authRouter.post("/register", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        res.status(400).json({ error: "username, email, and password are required" });
        return;
    }
    if (usersDb.has(email)) {
        res.status(409).json({ error: "Email is already registered" });
        return;
    }
    const userId = defaultSnowflake.nextId();
    const discriminator = Math.floor(1000 + Math.random() * 9000).toString();
    const passwordHash = await bcrypt.hash(password, 10);
    // Standard member permissions
    const standardPermissions = Permissions.VIEW_CHANNEL |
        Permissions.SEND_MESSAGES |
        Permissions.CONNECT |
        Permissions.SPEAK |
        Permissions.ADD_REACTIONS;
    const newUser = {
        id: userId,
        username,
        email,
        discriminator,
        permissions: standardPermissions,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
    };
    usersDb.set(email, { user: newUser, passwordHash });
    const token = generateToken(newUser);
    res.status(201).json({
        message: "Registration successful",
        token,
        user: {
            ...newUser,
            permissions: newUser.permissions.toString(),
        },
    });
});
// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
    }
    const record = usersDb.get(email);
    if (!record) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }
    const isPasswordValid = await bcrypt.compare(password, record.passwordHash);
    if (!isPasswordValid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }
    const token = generateToken(record.user);
    res.json({
        message: "Login successful",
        token,
        user: {
            ...record.user,
            permissions: record.user.permissions.toString(),
        },
    });
});
// GET /api/auth/me (Protected route - Authenticated only)
authRouter.get("/me", authenticateToken, (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: "Not logged in" });
        return;
    }
    res.json({
        user: {
            ...req.user,
            permissions: req.user.permissions.toString(),
        },
    });
});
// POST /api/admin/channels (Authorized route - Requires MANAGE_CHANNELS permission)
authRouter.post("/admin/channels", authenticateToken, requirePermission(Permissions.MANAGE_CHANNELS), (req, res) => {
    const { name, type } = req.body;
    const channelId = defaultSnowflake.nextId();
    res.status(201).json({
        message: "Channel created successfully (Authorized by MANAGE_CHANNELS)",
        channel: {
            id: channelId,
            name,
            type: type || "text",
            createdBy: req.user?.username,
        },
    });
});
