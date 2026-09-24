import http from "http";
import express from "express";
import { GatewayServer } from "./gateway/server.js";
import { Snowflake, defaultSnowflake } from "./utils/snowflake.js";
import { authRouter } from "./routes/auth.js";
import { initDb } from "./db/db.js";
const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json());
// Enable CORS for frontend
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
        res.sendStatus(200);
        return;
    }
    next();
});
// Mount Authentication & Authorization routes
app.use("/api/auth", authRouter);
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Example Snowflake generator endpoint
app.get("/api/snowflake", (req, res) => {
    const id = defaultSnowflake.nextId();
    res.json({ id, generated_at: Snowflake.getTimestamp(id) });
});
// Initialize database schema on startup
initDb().catch((err) => console.error("[DB] Init failed:", err));
// Create HTTP server supporting both Express REST API and WebSocket Gateway
const server = http.createServer(app);
// Attach Gateway WebSocket Engine to HTTP server
new GatewayServer(server);
server.listen(PORT, () => {
    console.log(`[Server] Unified REST API and Gateway WebSocket running on port ${PORT}`);
});
