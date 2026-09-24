import pg from "pg";
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL ||
    "postgres://postgres:postgrespassword@localhost:5432/discord_db";
export const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" && !connectionString.includes("localhost")
        ? { rejectUnauthorized: false }
        : false,
});
export async function initDb() {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(32) NOT NULL,
          discriminator VARCHAR(4) NOT NULL DEFAULT '0000',
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          avatar_url VARCHAR(512),
          banner_color VARCHAR(32) DEFAULT '#5865F2',
          bio VARCHAR(256),
          permissions VARCHAR(64) DEFAULT '0',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
            console.log("[DB] PostgreSQL users table initialized successfully");
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.warn("[DB] Could not connect to PostgreSQL. Using persistent in-memory/JSON fallback.", err.message);
    }
}
