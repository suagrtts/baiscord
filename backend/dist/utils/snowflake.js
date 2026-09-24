/**
 * 64-bit Snowflake ID Generator
 * Compatible with Discord Snowflake specification:
 * - 42 bits: Timestamp in milliseconds since custom epoch
 * - 5 bits: Datacenter / Worker ID (0-31)
 * - 5 bits: Process ID (0-31)
 * - 12 bits: Incremental Sequence (0-4095)
 */
export class Snowflake {
    // Epoch: 2025-01-01T00:00:00.000Z
    static EPOCH = 1735689600000n;
    static WORKER_ID_BITS = 5n;
    static PROCESS_ID_BITS = 5n;
    static SEQUENCE_BITS = 12n;
    static MAX_WORKER_ID = -1n ^ (-1n << Snowflake.WORKER_ID_BITS);
    static MAX_PROCESS_ID = -1n ^ (-1n << Snowflake.PROCESS_ID_BITS);
    static MAX_SEQUENCE = -1n ^ (-1n << Snowflake.SEQUENCE_BITS);
    static WORKER_ID_SHIFT = Snowflake.SEQUENCE_BITS;
    static PROCESS_ID_SHIFT = Snowflake.SEQUENCE_BITS + Snowflake.WORKER_ID_BITS;
    static TIMESTAMP_LEFT_SHIFT = Snowflake.SEQUENCE_BITS + Snowflake.WORKER_ID_BITS + Snowflake.PROCESS_ID_BITS;
    workerId;
    processId;
    sequence = 0n;
    lastTimestamp = -1n;
    constructor(workerId = 1n, processId = 1n) {
        if (workerId < 0n || workerId > Snowflake.MAX_WORKER_ID) {
            throw new Error(`Worker ID must be between 0 and ${Snowflake.MAX_WORKER_ID}`);
        }
        if (processId < 0n || processId > Snowflake.MAX_PROCESS_ID) {
            throw new Error(`Process ID must be between 0 and ${Snowflake.MAX_PROCESS_ID}`);
        }
        this.workerId = workerId;
        this.processId = processId;
    }
    nextId() {
        let timestamp = BigInt(Date.now());
        if (timestamp < this.lastTimestamp) {
            throw new Error(`Clock moved backwards! Refusing to generate ID for ${this.lastTimestamp - timestamp}ms`);
        }
        if (this.lastTimestamp === timestamp) {
            this.sequence = (this.sequence + 1n) & Snowflake.MAX_SEQUENCE;
            if (this.sequence === 0n) {
                // Wait till next millisecond
                while (timestamp <= this.lastTimestamp) {
                    timestamp = BigInt(Date.now());
                }
            }
        }
        else {
            this.sequence = 0n;
        }
        this.lastTimestamp = timestamp;
        const id = ((timestamp - Snowflake.EPOCH) << Snowflake.TIMESTAMP_LEFT_SHIFT) |
            (this.processId << Snowflake.PROCESS_ID_SHIFT) |
            (this.workerId << Snowflake.WORKER_ID_SHIFT) |
            this.sequence;
        return id.toString();
    }
    static getTimestamp(id) {
        const snowflake = BigInt(id);
        const timestampMs = (snowflake >> Snowflake.TIMESTAMP_LEFT_SHIFT) + Snowflake.EPOCH;
        return new Date(Number(timestampMs));
    }
}
export const defaultSnowflake = new Snowflake(1n, 1n);
