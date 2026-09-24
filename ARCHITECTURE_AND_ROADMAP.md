# Comprehensive Blueprint & Implementation Roadmap: Discord Clone

This document details the architectural blueprint, technology stack selection, database schemas, real-time gateway protocols, WebRTC media topology, and an incremental phase-by-phase implementation plan for building a production-grade Discord clone.

---

## 1. System Architecture & Topology

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT LAYER                                         |
|                                                                                         |
|  [ Web Browser (Next.js) ]    [ Desktop App (Tauri / Electron) ]   [ Mobile (React Native) ]
+----------------------------+-----------------------------+------------------------------+
                             |                             |
                             | HTTPS / REST                | WSS (WebSocket Gateway)
                             v                             v
+-----------------------------------------------------------------------------------------+
|                             EDGE & REVERSE PROXY LAYER                                  |
|                                                                                         |
|                       Cloudflare CDN / Traefik / Nginx Proxy                            |
|             (TLS Termination, DDoS Shield, Anycast Routing, HTTP/3, WSS)                |
+----------------------------+-----------------------------+------------------------------+
                             |                             |
                             v                             v
+------------------------------------+             +------------------------------------+
|         REST API SERVICE           |             |         GATEWAY SERVICE            |
|       (Go / Rust / Node.js)        |             |      (Go / Elixir / Rust)          |
|                                    |             |                                    |
| - Authentication & Sessions (PASETO)             | - Persistent WebSocket Connections |
| - Guilds, Channels & Role Hierarchies             | - Heartbeat (Ping/Pong) & Resumption|
| - Bitwise Permissions Resolution   |             | - Event Fanout & Presences         |
| - Message Ingestion & Pagination   |             | - Typing Indicators & Voice Signaler|
+-----------------+------------------+             +-----------------+------------------+
                  |                                                  |
                  +------------------------+-------------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |           REDIS / VALKEY BUS          |
                       |                                       |
                       | - Pub/Sub Event Broadcast Spine       |
                       | - Distributed Sliding-Window Rate Limit|
                       | - Ephemeral Presence Cache & Voice Map|
                       +---------------------------------------+
                                           |
                  +------------------------+------------------------+
                  |                                                 |
                  v                                                 v
+------------------------------------+            +------------------------------------+
|      POSTGRESQL (Core Relational)  |            |     SCYLLADB / PG PARTITIONS       |
|                                    |            |                                    |
| - Users, Passwords (Argon2id)      |            | - Messages Table (Partitioned by   |
| - Guilds, Categories, Channels     |            |   channel_id + time bucket)        |
| - Roles & Channel Overwrites       |            | - Reactions & Message Embeds       |
| - Audit Logs & Memberships         |            | - Keyset Pagination via Snowflake  |
+------------------------------------+            +------------------------------------+

+-----------------------------------------------------------------------------------------+
|                               MEDIA & REALTIME SFU LAYER                                |
|                                                                                         |
|   +------------------------------------+     +-------------------------------------+   |
|   |         LIVEKIT SFU ENGINE         |     |        OBJECT STORAGE & CDN         |   |
|   |   (WebRTC Audio, Video & Screen)   |     |    (MinIO / Cloudflare R2 / S3)      |   |
|   | - Low-latency Selective Forwarding |     | - User Avatars & Server Banners     |   |
|   | - Opus Audio (adaptive 8-128kbps)  |     | - Upload Attachments (HMAC Signed)  |   |
|   | - VP8/AV1 Simulcast Video Feeds    |     | - Image Resizing & EXIF Stripper    |   |
|   +------------------------------------+     +-------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Technology Stack Selection

### 2.1 Recommended Production Stack

| Component | Recommended Technology | Why Chosen? | Viable Alternative |
| :--- | :--- | :--- | :--- |
| **Web Frontend** | **Next.js 15 (App Router) + React 19 + TypeScript** | Server Components, optimal SEO for landing/explore, fast hydration, Tailwind CSS ecosystem. | Vite + React SPA |
| **Desktop Client** | **Tauri (v2)** | 10x smaller bundle size than Electron (~15MB vs ~150MB), tiny memory footprint, native Rust speed. | Electron |
| **Styling & UI** | **Tailwind CSS + Radix UI / Shadcn UI + Lucide Icons** | Pixel-perfect Discord dark theme, accessible primitives, unstyled components for maximum customization. | Tailwind + Headless UI |
| **Client State** | **Zustand + TanStack Query (React Query)** | Zustand handles ephemeral UI & active gateway socket states; TanStack Query handles server cache & optimistic UI. | Redux Toolkit |
| **API Backend** | **Go (Fiber or Chi)** or **Node.js (NestJS / Fastify)** | Go provides high concurrency, zero GC stalls, microsecond routing, tiny binaries. Fastify/NestJS if full-JS team. | Rust (Axum) |
| **Gateway (Realtime)**| **Go (Gorilla/nhooyr websocket) or Elixir** | Goroutines scale to 1M+ idle connections effortlessly with low RAM usage (~4KB per conn). | Node.js + `ws` cluster |
| **Primary Relational DB**| **PostgreSQL 16** | Robust relations, foreign keys, JSONB for embed objects, native bitwise operators for Discord permissions. | CockroachDB |
| **Message Store** | **PostgreSQL (Declarative Partitioning)** or **ScyllaDB** | For <50M messages, monthly PG range partitioning is frictionless; for >100M, ScyllaDB (C++ Cassandra). | ScyllaDB |
| **Cache & Event Bus** | **Redis (or Valkey) 7+** | Pub/sub channel fanout between Gateway nodes, rate-limiting counters, fast presence lookup. | RabbitMQ / NATS |
| **Voice & Video SFU** | **LiveKit** | Production-ready open-source WebRTC SFU built in Go, supports scalable rooms, screen sharing, token auth. | mediasoup / Janus |
| **Object Storage** | **Cloudflare R2** or **MinIO (Self-hosted)** | S3-compatible API, zero egress bandwidth fees (R2), built-in edge caching. | AWS S3 |

---

## 3. Core Database Schema & Domain Modeling

### 3.1 Snowflake ID Generation (64-bit BigInt)
All entities (`users`, `guilds`, `channels`, `messages`, `roles`) use 64-bit Snowflake IDs composed of:
*   **42 bits:** Millisecond timestamp since custom Epoch (e.g., `2025-01-01T00:00:00.000Z`).
*   **10 bits:** Node/Machine + Worker ID (up to 1,024 cluster workers).
*   **12 bits:** Monotonic sequence counter (up to 4,096 IDs per ms per worker).

*Benefits: Auto-indexed, chronologically ordered, no database sequential locks.*

### 3.2 Relational Schema (PostgreSQL)

```sql
-- 1. Users
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    discriminator VARCHAR(4),             -- e.g. "0001" or modern unique username tag
    display_name VARCHAR(64),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- Argon2id
    avatar_url VARCHAR(512),
    banner_url VARCHAR(512),
    bio VARCHAR(256),
    flags INT DEFAULT 0,                  -- 1<<0: Staff, 1<<1: Partner, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Guilds (Servers)
CREATE TABLE guilds (
    id BIGINT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon_url VARCHAR(512),
    banner_url VARCHAR(512),
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    afk_channel_id BIGINT,
    afk_timeout INT DEFAULT 300,
    system_channel_id BIGINT,
    verification_level INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Roles
CREATE TABLE roles (
    id BIGINT PRIMARY KEY,
    guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color INT DEFAULT 0,                  -- Hex color stored as 24-bit int
    hoist BOOLEAN DEFAULT FALSE,          -- Display separately in member list
    position INT NOT NULL DEFAULT 0,      -- Ordering hierarchy
    permissions BIGINT NOT NULL,          -- Bitfield of permissions
    mentionable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Guild Members
CREATE TABLE guild_members (
    guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname VARCHAR(64),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    timeout_until TIMESTAMPTZ,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE member_roles (
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (guild_id, user_id, role_id),
    FOREIGN KEY (guild_id, user_id) REFERENCES guild_members(guild_id, user_id) ON DELETE CASCADE
);

-- 5. Channels
CREATE TABLE channels (
    id BIGINT PRIMARY KEY,
    guild_id BIGINT REFERENCES guilds(id) ON DELETE CASCADE, -- NULL for DMs
    category_id BIGINT REFERENCES channels(id) ON DELETE SET NULL,
    type INT NOT NULL,                    -- 0: Text, 1: DM, 2: Voice, 3: Group DM, 4: Category
    name VARCHAR(100),
    topic VARCHAR(1024),
    position INT DEFAULT 0,
    slowmode_seconds INT DEFAULT 0,
    bitrate INT DEFAULT 64000,            -- Voice channels only
    user_limit INT DEFAULT 0,             -- Voice channels only
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Channel Permission Overwrites
CREATE TABLE channel_overwrites (
    channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    target_id BIGINT NOT NULL,            -- Role ID or User ID
    target_type INT NOT NULL,             -- 0: Role, 1: Member
    allow BIGINT NOT NULL DEFAULT 0,
    deny BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, target_id)
);

-- 7. Messages (Range Partitioned by month or channel bucket)
CREATE TABLE messages (
    id BIGINT NOT NULL,                   -- Snowflake ID (timestamp component provides sort)
    channel_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    is_pinned BOOLEAN DEFAULT FALSE,
    reply_to_id BIGINT,                   -- Thread or quoted message
    attachments JSONB DEFAULT '[]'::jsonb,
    embeds JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    PRIMARY KEY (channel_id, id)
) PARTITION BY HASH (channel_id);         -- Or partitioned by timestamp range
```

---

## 4. Real-Time Gateway Protocol Specification

Communication operates over a bidirectional WebSocket (`wss://gateway.example.com`).

### 4.1 Frame Envelope Format
Every payload transferred via the Gateway adheres to this JSON schema:
```json
{
  "op": 0,               // Opcode (Integer)
  "d": {},               // Payload Data (Object/Array/Scalar)
  "s": 142,              // Sequence Number (Integer, only in Opcode 0 Dispatch)
  "t": "MESSAGE_CREATE"  // Event Name (String, only in Opcode 0 Dispatch)
}
```

### 4.2 Standard Opcode Map
| Opcode | Name | Direction | Description |
| :--- | :--- | :--- | :--- |
| `0` | **Dispatch** | Receive | Pushes an event (e.g. `MESSAGE_CREATE`, `PRESENCE_UPDATE`) |
| `1` | **Heartbeat** | Send / Receive | Client sends periodically to keep connection alive |
| `2` | **Identify** | Send | Initial handshake with auth token, intents, client info |
| `3` | **Presence Update** | Send | Updates user status (online, idle, dnd, custom status) |
| `4` | **Voice State Update** | Send | Join, leave, mute, or deafen in a voice channel |
| `6` | **Resume** | Send | Reconnect dropped session without losing state buffer |
| `7` | **Reconnect** | Receive | Server signals client must reconnect immediately |
| `9` | **Invalid Session**| Receive | Session expired or invalid; client must fresh identify |
| `10`| **Hello** | Receive | Sent immediately on connect; specifies `heartbeat_interval` |
| `11`| **Heartbeat ACK** | Receive | Server acknowledges heartbeat |

---

## 5. Bitwise Permissions Engine

Discord calculates access dynamically without storing redundant boolean flags.

### 5.1 Bitfield Constants (64-bit)
```typescript
export const Permissions = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS:          1n << 1n,
  BAN_MEMBERS:           1n << 2n,
  ADMINISTRATOR:         1n << 3n,
  MANAGE_CHANNELS:       1n << 4n,
  MANAGE_GUILD:          1n << 5n,
  ADD_REACTIONS:         1n << 6n,
  VIEW_AUDIT_LOG:        1n << 7n,
  VIEW_CHANNEL:          1n << 10n,
  SEND_MESSAGES:         1n << 11n,
  SEND_TTS_MESSAGES:     1n << 12n,
  MANAGE_MESSAGES:       1n << 13n,
  EMBED_LINKS:           1n << 14n,
  ATTACH_FILES:          1n << 15n,
  READ_MESSAGE_HISTORY:  1n << 16n,
  MENTION_EVERYONE:      1n << 17n,
  CONNECT:               1n << 20n,
  SPEAK:                 1n << 21n,
  MUTE_MEMBERS:          1n << 22n,
  DEAFEN_MEMBERS:        1n << 23n,
  MOVE_MEMBERS:          1n << 24n,
  MANAGE_ROLES:          1n << 28n,
} as const;
```

### 5.2 Resolution Algorithm
1. If user is **Guild Owner** $\rightarrow$ Return `ALL_PERMISSIONS`.
2. Compute `base_permissions` = `@everyone.permissions | role_1.permissions | role_2.permissions ...`
3. If `(base_permissions & ADMINISTRATOR) == ADMINISTRATOR` $\rightarrow$ Return `ALL_PERMISSIONS`.
4. Apply Channel Overwrites:
   - Apply `@everyone` channel overwrite: `perms = (perms & ~everyone_deny) | everyone_allow`
   - Accumulate and apply user's roles overwrites:
     `role_deny = OR(all_user_role_denies)`, `role_allow = OR(all_user_role_allows)`
     `perms = (perms & ~role_deny) | role_allow`
   - Apply member-specific overwrite (if exists):
     `perms = (perms & ~member_deny) | member_allow`
5. If `(perms & VIEW_CHANNEL) == 0` $\rightarrow$ User has no access to the channel.

---

## 6. Voice, Video & Screen Sharing Architecture

### 6.1 Selective Forwarding Unit (SFU) Integration
Rather than building a brittle P2P mesh or high-latency MCU, integrate **LiveKit**:
1. When a user clicks a Voice Channel, the client emits `Opcode 4: Voice State Update`.
2. The REST API validates permissions (`CONNECT`, `SPEAK`) and requests a cryptographically signed room token from LiveKit Server (`apiKey`, `apiSecret`, room: `channel_id`, identity: `user_id`).
3. The API returns the token and LiveKit WebSocket URL.
4. The client uses `@livekit/components-react` to establish an interactive WebRTC connection.
5. The LiveKit SFU forwards raw RTP streams (Opus 48kHz stereo, VP8/H.264 screen capture) to other connected peers with adaptive bitrate and simulcast.

---

## 7. Media Handling & Storage Pipeline

```
[Client] 
   |
   | 1. Request Signed Upload URL (POST /channels/{id}/attachments)
   v
[API Server] ---> Verifies Auth & File Quota
   |
   | 2. Returns Pre-signed PUT URL (Cloudflare R2 / S3)
   v
[Client] --------> Direct Upload (PUT to R2/S3 bucket)
   |
   | 3. Post Message with Attachment Metadata
   v
[API Server] ---> Strips EXIF via background worker, writes message to DB, broadcasts via Gateway
```

*   **Security:** Attachments are issued with expiring HMAC signatures to prevent unauthorized hotlinking.
*   **Media Proxy:** External user links are routed through `/api/proxy?url=...` to avoid IP address leaks and strip trackers.

---

## 8. Phased Implementation Roadmap

### Phase 1: Core Foundation & Data Modeling (Weeks 1–2)
- [ ] Initialize repository structure (Monorepo with Next.js web client & Go/Node backend).
- [ ] Implement Snowflake ID generator algorithm.
- [ ] Set up PostgreSQL database with migrations (Users, Guilds, Channels, Roles, Members).
- [ ] Build Authentication system (Argon2id, PASETO/JWT access + refresh token rotation).
- [ ] Implement basic CRUD REST endpoints for Servers, Channels, and Profiles.

### Phase 2: Gateway Engine & Real-Time Messaging (Weeks 3–4)
- [ ] Implement Gateway WebSocket server with Heartbeat (`PING`/`PONG`), `IDENTIFY`, and `RESUME`.
- [ ] Connect Redis Pub/Sub spine to propagate events across gateway server nodes.
- [ ] Create channel message sending (`MESSAGE_CREATE`), editing, and deleting.
- [ ] Implement Keyset pagination for infinite scrolling history (`before={snowflake_id}&limit=50`).
- [ ] Add typing indicators (`TYPING_START`) and user online/offline presence tracking.

### Phase 3: Permissions, Roles & Hierarchy (Weeks 5–6)
- [ ] Implement 64-bit bitwise permissions calculation engine in both backend and frontend.
- [ ] Add Role Management UI (drag-and-drop role ordering, color picker, permission toggles).
- [ ] Implement Channel Overwrites (custom permissions for specific roles/members on a channel).
- [ ] Enforce permission checks across REST API and Gateway dispatch.

### Phase 4: Voice & Video Integration (Weeks 7–8)
- [ ] Deploy LiveKit Server instance (via Docker / local container).
- [ ] Integrate LiveKit client SDK into voice channels.
- [ ] Implement active speaker indicators, mute/deafen toggles, and individual volume sliders.
- [ ] Add Screen Sharing with audio capture support.

### Phase 5: Rich Features & Polish (Weeks 9–10)
- [ ] Direct Messages (DMs) and multi-user Group DMs.
- [ ] Emoji reactions and custom server emojis.
- [ ] File uploads with pre-signed URLs, image preview lightboxes, and media player.
- [ ] OpenGraph link previews and Markdown formatting (bold, italic, code blocks with syntax highlighting).
- [ ] Packaging: Wrap frontend in Tauri v2 for native Windows/macOS desktop builds.
