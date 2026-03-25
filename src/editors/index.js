import * as claude from './claude.js';
import * as opencode from './opencode.js';
import * as cursor from './cursor.js';
import * as antigravity from './antigravity.js';

const adapters = [claude, opencode, cursor, antigravity];

export const EDITOR_META = Object.fromEntries(
  adapters.map(a => [a.name, { label: a.label, color: a.color }])
);

export function getAllChats() {
  const all = [];
  for (const adapter of adapters) {
    try {
      const chats = adapter.getChats();
      all.push(...chats);
    } catch (err) {
      // Skip editors that fail silently
    }
  }
  return all.sort((a, b) => (b.lastUpdatedAt || b.createdAt || 0) - (a.lastUpdatedAt || a.createdAt || 0));
}

export function getMessages(chat) {
  const adapter = adapters.find(a => a.name === chat.source);
  if (!adapter) return [];
  try {
    return adapter.getMessages(chat);
  } catch {
    return [];
  }
}
