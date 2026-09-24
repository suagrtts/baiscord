import { WebSocketServer, WebSocket } from "ws";
import { GatewayOpcode, GatewayEvent } from "./protocol.js";
export class GatewayServer {
    wss;
    sessions = new Map();
    heartbeatInterval = 41250; // Discord standard interval (ms)
    constructor(serverOrPort = 8080) {
        if (typeof serverOrPort === "number") {
            this.wss = new WebSocketServer({ port: serverOrPort });
            console.log(`[Gateway] Realtime Gateway listening on standalone port ${serverOrPort}`);
        }
        else {
            this.wss = new WebSocketServer({ server: serverOrPort });
            console.log(`[Gateway] Realtime Gateway attached to unified HTTP server`);
        }
        this.setupListeners();
    }
    setupListeners() {
        this.wss.on("connection", (ws) => {
            const sessionId = Math.random().toString(36).substring(2, 15);
            this.sessions.set(ws, {
                sessionId,
                lastHeartbeat: Date.now(),
                authenticated: false,
            });
            // 1. Send Opcode 10: HELLO immediately on connection
            this.send(ws, {
                op: GatewayOpcode.HELLO,
                d: { heartbeat_interval: this.heartbeatInterval },
            });
            ws.on("message", (data) => {
                try {
                    const payload = JSON.parse(data.toString());
                    this.handlePayload(ws, payload);
                }
                catch {
                    console.error("[Gateway] Failed to parse message");
                }
            });
            ws.on("close", () => {
                const session = this.sessions.get(ws);
                if (session?.channelId) {
                    // Notify room members that user left
                    this.broadcastToVoiceChannel(session.channelId, ws, {
                        op: GatewayOpcode.DISPATCH,
                        t: GatewayEvent.VOICE_STATE_UPDATE,
                        d: { userId: session.userId, channelId: null },
                    });
                }
                this.sessions.delete(ws);
            });
        });
    }
    handlePayload(ws, payload) {
        const session = this.sessions.get(ws);
        if (!session)
            return;
        switch (payload.op) {
            case GatewayOpcode.HEARTBEAT:
                session.lastHeartbeat = Date.now();
                this.send(ws, { op: GatewayOpcode.HEARTBEAT_ACK });
                break;
            case GatewayOpcode.IDENTIFY: {
                const data = payload.d;
                session.authenticated = true;
                session.userId = data.userId || "u-" + Math.floor(1000 + Math.random() * 9000);
                session.username = data.username || "User-" + session.userId.slice(-4);
                session.avatar = data.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${session.username}`;
                // Collect all online users currently connected to the gateway
                const onlineUsers = [];
                for (const [_, s] of this.sessions.entries()) {
                    if (s.userId && s.username) {
                        onlineUsers.push({
                            id: s.userId,
                            username: s.username,
                            avatar: s.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${s.username}`,
                            status: "online",
                        });
                    }
                }
                this.send(ws, {
                    op: GatewayOpcode.DISPATCH,
                    s: 1,
                    t: GatewayEvent.READY,
                    d: {
                        session_id: session.sessionId,
                        user: { id: session.userId, username: session.username, avatar: session.avatar },
                        users: onlineUsers,
                        guilds: [],
                    },
                });
                // Notify all other clients that a new user connected with their profile
                for (const [otherWs, otherSession] of this.sessions.entries()) {
                    if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
                        this.send(otherWs, {
                            op: GatewayOpcode.DISPATCH,
                            t: "USER_UPDATE",
                            d: {
                                id: session.userId,
                                username: session.username,
                                avatar: session.avatar,
                                status: "online",
                            },
                        });
                    }
                }
                break;
            }
            case GatewayOpcode.VOICE_STATE_UPDATE: {
                const data = payload.d;
                const oldChannel = session.channelId;
                session.channelId = data.channelId || undefined;
                if (oldChannel && oldChannel !== data.channelId) {
                    // Notify peers in the previous voice channel that user left
                    this.broadcastToVoiceChannel(oldChannel, ws, {
                        op: GatewayOpcode.DISPATCH,
                        t: GatewayEvent.VOICE_STATE_UPDATE,
                        d: {
                            userId: session.userId,
                            channelId: null,
                            user: {
                                id: session.userId,
                                username: session.username,
                                avatar: session.avatar,
                            },
                        },
                    });
                }
                if (data.channelId) {
                    // 1. Tell all existing participants in this voice channel that a new peer joined
                    this.broadcastToVoiceChannel(data.channelId, ws, {
                        op: GatewayOpcode.DISPATCH,
                        t: GatewayEvent.VOICE_STATE_UPDATE,
                        d: {
                            userId: session.userId,
                            channelId: data.channelId,
                            user: {
                                id: session.userId,
                                username: session.username,
                                avatar: session.avatar,
                            },
                        },
                    });
                    // 2. Send the newly joined user the list of existing peers in this channel
                    const existingPeers = [];
                    const existingPeerUsers = [];
                    for (const [peerWs, peerSession] of this.sessions.entries()) {
                        if (peerWs !== ws && peerSession.channelId === data.channelId && peerSession.userId) {
                            existingPeers.push(peerSession.userId);
                            existingPeerUsers.push({
                                id: peerSession.userId,
                                username: peerSession.username || `User-${peerSession.userId.slice(-4)}`,
                                avatar: peerSession.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerSession.userId}`,
                            });
                        }
                    }
                    this.send(ws, {
                        op: GatewayOpcode.DISPATCH,
                        t: GatewayEvent.VOICE_SERVER_UPDATE,
                        d: {
                            channelId: data.channelId,
                            peers: existingPeers,
                            peerUsers: existingPeerUsers,
                        },
                    });
                }
                break;
            }
            case GatewayOpcode.VOICE_SIGNAL: {
                // Forward WebRTC SDP offer, answer, or ICE candidate to the target peer
                const data = payload.d;
                for (const [peerWs, peerSession] of this.sessions.entries()) {
                    if (peerSession.userId === data.targetUserId && peerWs.readyState === WebSocket.OPEN) {
                        this.send(peerWs, {
                            op: GatewayOpcode.DISPATCH,
                            t: GatewayEvent.VOICE_SIGNAL,
                            d: { senderUserId: session.userId, signal: data.signal },
                        });
                        break;
                    }
                }
                break;
            }
            default:
                console.log(`[Gateway] Unhandled Opcode: ${payload.op}`);
        }
    }
    broadcastToVoiceChannel(channelId, senderWs, payload) {
        for (const [peerWs, peerSession] of this.sessions.entries()) {
            if (peerWs !== senderWs && peerSession.channelId === channelId && peerWs.readyState === WebSocket.OPEN) {
                this.send(peerWs, payload);
            }
        }
    }
    broadcastEvent(eventName, data, recipientFilter) {
        for (const [ws, session] of this.sessions.entries()) {
            if (ws.readyState === WebSocket.OPEN && (!recipientFilter || recipientFilter(session))) {
                this.send(ws, {
                    op: GatewayOpcode.DISPATCH,
                    t: eventName,
                    d: data,
                });
            }
        }
    }
    send(ws, payload) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }
}
