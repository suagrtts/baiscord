import express from "express";
import { GatewayServer } from "./gateway/server.js";
import { Snowflake, defaultSnowflake } from "./utils/snowflake.js";
import { authRouter } from "./routes/auth.js";
const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;
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
// Start REST API
app.listen(PORT, () => {
    console.log(`[REST API] Server running on port ${PORT}`);
});
// Start Gateway WebSocket Engine
new GatewayServer(WS_PORT);
