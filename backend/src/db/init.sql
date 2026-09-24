-- =============================================================================
-- Discord Clone - Core Schema & Seed Setup
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    discriminator VARCHAR(4) NOT NULL DEFAULT '0000',
    display_name VARCHAR(64),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(512),
    banner_url VARCHAR(512),
    bio VARCHAR(256),
    flags INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Guilds (Servers) Table
CREATE TABLE IF NOT EXISTS guilds (
    id BIGINT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon_url VARCHAR(512),
    banner_url VARCHAR(512),
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    system_channel_id BIGINT,
    afk_channel_id BIGINT,
    afk_timeout INT DEFAULT 300,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Roles Table
CREATE TABLE IF NOT EXISTS roles (
    id BIGINT PRIMARY KEY,
    guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color INT DEFAULT 0,
    hoist BOOLEAN DEFAULT FALSE,
    position INT NOT NULL DEFAULT 0,
    permissions BIGINT NOT NULL DEFAULT 0,
    mentionable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Guild Members Table
CREATE TABLE IF NOT EXISTS guild_members (
    guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname VARCHAR(64),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    timeout_until TIMESTAMPTZ,
    PRIMARY KEY (guild_id, user_id)
);

-- 5. Member Roles Junction
CREATE TABLE IF NOT EXISTS member_roles (
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (guild_id, user_id, role_id),
    FOREIGN KEY (guild_id, user_id) REFERENCES guild_members(guild_id, user_id) ON DELETE CASCADE
);

-- 6. Channels Table
-- Types: 0 = GUILD_TEXT, 1 = DM, 2 = GUILD_VOICE, 3 = GROUP_DM, 4 = GUILD_CATEGORY
CREATE TABLE IF NOT EXISTS channels (
    id BIGINT PRIMARY KEY,
    guild_id BIGINT REFERENCES guilds(id) ON DELETE CASCADE,
    category_id BIGINT REFERENCES channels(id) ON DELETE SET NULL,
    type INT NOT NULL DEFAULT 0,
    name VARCHAR(100),
    topic VARCHAR(1024),
    position INT DEFAULT 0,
    slowmode_seconds INT DEFAULT 0,
    bitrate INT DEFAULT 64000,
    user_limit INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Channel Permission Overwrites
-- target_type: 0 = Role, 1 = Member
CREATE TABLE IF NOT EXISTS channel_overwrites (
    channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    target_id BIGINT NOT NULL,
    target_type INT NOT NULL,
    allow BIGINT NOT NULL DEFAULT 0,
    deny BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, target_id)
);

-- 8. Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    is_pinned BOOLEAN DEFAULT FALSE,
    reply_to_id BIGINT,
    attachments JSONB DEFAULT '[]'::jsonb,
    embeds JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    PRIMARY KEY (channel_id, id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);
CREATE INDEX IF NOT EXISTS idx_channels_guild ON channels(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user ON guild_members(user_id);
