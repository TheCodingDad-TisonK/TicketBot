// src/utils/permissions.js
// Centralised permission checking — all settings come from database
// Server admins configure everything via Discord commands (/settings, /panel)

const { Settings } = require('./database');

function getSettings(guildId) {
  return Settings.get.get(guildId) || {};
}

function hasRole(member, roleId) {
  if (!roleId || !member) return false;
  return member.roles.cache.has(roleId);
}

/**
 * Returns true if member has at minimum "Mod" access.
 * Hierarchy: Server Owner > Admin (has Administrator permission OR admin_role) > Mod (mod_role)
 */
function isMod(member, guildId) {
  if (!member) return false;
  // Server owner always has access
  if (member.id === member.guild.ownerId) return true;
  // Check for Administrator permission
  if (member.permissions.has('Administrator')) return true;
  
  const s = getSettings(guildId);
  const dbRoles = [s.mod_role, s.admin_role];
  return dbRoles.filter(Boolean).some(r => hasRole(member, r));
}

function isAdmin(member, guildId) {
  if (!member) return false;
  // Server owner always has admin access
  if (member.id === member.guild.ownerId) return true;
  // Check for Administrator permission
  if (member.permissions.has('Administrator')) return true;
  
  const s = getSettings(guildId);
  return [s.admin_role].filter(Boolean).some(r => hasRole(member, r));
}

function isOwner(member) {
  if (!member) return false;
  // Server owner is always the owner
  return member.id === member.guild.ownerId;
}

module.exports = { isMod, isAdmin, isOwner };
