/**
 * Discord-compatible 64-bit Bitwise Permissions Engine
 */
export const Permissions = {
    CREATE_INSTANT_INVITE: 1n << 0n,
    KICK_MEMBERS: 1n << 1n,
    BAN_MEMBERS: 1n << 2n,
    ADMINISTRATOR: 1n << 3n,
    MANAGE_CHANNELS: 1n << 4n,
    MANAGE_GUILD: 1n << 5n,
    ADD_REACTIONS: 1n << 6n,
    VIEW_AUDIT_LOG: 1n << 7n,
    PRIORITY_SPEAKER: 1n << 8n,
    STREAM: 1n << 9n,
    VIEW_CHANNEL: 1n << 10n,
    SEND_MESSAGES: 1n << 11n,
    SEND_TTS_MESSAGES: 1n << 12n,
    MANAGE_MESSAGES: 1n << 13n,
    EMBED_LINKS: 1n << 14n,
    ATTACH_FILES: 1n << 15n,
    READ_MESSAGE_HISTORY: 1n << 16n,
    MENTION_EVERYONE: 1n << 17n,
    USE_EXTERNAL_EMOJIS: 1n << 18n,
    VIEW_GUILD_INSIGHTS: 1n << 19n,
    CONNECT: 1n << 20n,
    SPEAK: 1n << 21n,
    MUTE_MEMBERS: 1n << 22n,
    DEAFEN_MEMBERS: 1n << 23n,
    MOVE_MEMBERS: 1n << 24n,
    USE_VAD: 1n << 25n,
    CHANGE_NICKNAME: 1n << 26n,
    MANAGE_NICKNAMES: 1n << 27n,
    MANAGE_ROLES: 1n << 28n,
    MANAGE_WEBHOOKS: 1n << 29n,
    MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
    USE_APPLICATION_COMMANDS: 1n << 31n,
};
export const ALL_PERMISSIONS = Object.values(Permissions).reduce((acc, p) => acc | p, 0n);
/**
 * Calculates user channel permissions using Discord's exact hierarchical bitwise resolution.
 */
export function computePermissions(params) {
    const { userId, guildOwnerId, everyoneRolePermissions, userRolePermissions, userRoleIds, overwrites = [], } = params;
    // 1. Guild owner has all permissions unconditionally
    if (userId === guildOwnerId) {
        return ALL_PERMISSIONS;
    }
    // 2. Base permissions = @everyone | all user roles
    let permissions = everyoneRolePermissions;
    for (const rolePerm of userRolePermissions) {
        permissions |= rolePerm;
    }
    // 3. Administrator bypasses all channel-specific restrictions
    if ((permissions & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
        return ALL_PERMISSIONS;
    }
    // 4. Channel Overwrites
    // 4a. Apply @everyone overwrite
    const everyoneOverwrite = overwrites.find((ow) => ow.targetType === 0 && ow.targetId === "everyone");
    if (everyoneOverwrite) {
        permissions = (permissions & ~everyoneOverwrite.deny) | everyoneOverwrite.allow;
    }
    // 4b. Apply Role overwrites
    let roleDeny = 0n;
    let roleAllow = 0n;
    for (const ow of overwrites) {
        if (ow.targetType === 0 && userRoleIds.includes(ow.targetId)) {
            roleDeny |= ow.deny;
            roleAllow |= ow.allow;
        }
    }
    permissions = (permissions & ~roleDeny) | roleAllow;
    // 4c. Apply Member-specific overwrite
    const memberOverwrite = overwrites.find((ow) => ow.targetType === 1 && ow.targetId === userId);
    if (memberOverwrite) {
        permissions = (permissions & ~memberOverwrite.deny) | memberOverwrite.allow;
    }
    return permissions;
}
export function hasPermission(computedPerms, requiredPerm) {
    return ((computedPerms & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR ||
        (computedPerms & requiredPerm) === requiredPerm);
}
