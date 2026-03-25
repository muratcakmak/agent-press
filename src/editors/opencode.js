import path from 'path';
import fs from 'fs';
import os from 'os';
import Database from 'better-sqlite3';

const STORAGE_DIR = path.join(os.homedir(), '.local', 'share', 'opencode', 'storage');
const SESSION_DIR = path.join(STORAGE_DIR, 'session');
const MESSAGE_DIR = path.join(STORAGE_DIR, 'message');
const PART_DIR = path.join(STORAGE_DIR, 'part');
const DB_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');

export const name = 'opencode';
export const label = 'OpenCode';
export const color = '#ec4899';

function queryDb(sql) {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(sql).all();
    db.close();
    return rows;
  } catch { return []; }
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function extractModelInfo(data) {
  if (typeof data?.modelID === 'string') return data.modelID;
  if (data?.model && typeof data.model === 'object') return data.model.modelID || null;
  if (typeof data?.model === 'string') return data.model;
  return null;
}

function extractTokenInfo(data) {
  const tokens = data?.tokens && typeof data.tokens === 'object' ? data.tokens : null;
  const cache = tokens?.cache && typeof tokens.cache === 'object' ? tokens.cache : null;
  return {
    inputTokens: tokens?.input,
    outputTokens: tokens?.output,
    cacheRead: cache?.read,
    cacheWrite: cache?.write,
  };
}

function getAllFileSessions() {
  const sessions = [];
  if (!fs.existsSync(SESSION_DIR)) return sessions;
  for (const projectHash of fs.readdirSync(SESSION_DIR)) {
    const projectDir = path.join(SESSION_DIR, projectHash);
    if (!fs.statSync(projectDir).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(projectDir).filter(f => f.startsWith('ses_') && f.endsWith('.json')); } catch { continue; }
    for (const file of files) {
      const data = readJson(path.join(projectDir, file));
      if (data && data.id) sessions.push(data);
    }
  }
  return sessions;
}

function getMessageCount(sessionId) {
  const sessionMsgDir = path.join(MESSAGE_DIR, sessionId);
  if (!fs.existsSync(sessionMsgDir)) return 0;
  try { return fs.readdirSync(sessionMsgDir).filter(f => f.startsWith('msg_') && f.endsWith('.json')).length; } catch { return 0; }
}

export function getChats() {
  const seen = new Set();
  const chats = [];

  // JSON file sessions
  for (const s of getAllFileSessions()) {
    seen.add(s.id);
    chats.push({
      source: 'opencode',
      composerId: s.id,
      name: s.title || null,
      createdAt: s.time?.created || null,
      lastUpdatedAt: s.time?.updated || null,
      mode: 'opencode',
      folder: s.directory || null,
      bubbleCount: getMessageCount(s.id),
      _storageType: 'file',
    });
  }

  // SQLite sessions
  const dbSessions = queryDb(
    `SELECT s.id, s.title, s.directory, s.time_created, s.time_updated,
            p.worktree, (SELECT count(*) FROM message m WHERE m.session_id = s.id) as msg_count
     FROM session s LEFT JOIN project p ON s.project_id = p.id
     ORDER BY s.time_updated DESC`
  );
  for (const row of dbSessions) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    chats.push({
      source: 'opencode',
      composerId: row.id,
      name: cleanTitle(row.title),
      createdAt: row.time_created || null,
      lastUpdatedAt: row.time_updated || null,
      mode: 'opencode',
      folder: row.worktree || row.directory || null,
      bubbleCount: row.msg_count || 0,
      _storageType: 'sqlite',
    });
  }

  return chats.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
}

export function getMessages(chat) {
  // Try file-based first
  const fileMessages = getFileMessages(chat.composerId);
  if (fileMessages.length > 0) return fileMessages;
  return getSqliteMessages(chat.composerId);
}

function getFileMessages(sessionId) {
  const sessionMsgDir = path.join(MESSAGE_DIR, sessionId);
  if (!fs.existsSync(sessionMsgDir)) return [];
  let files;
  try { files = fs.readdirSync(sessionMsgDir).filter(f => f.startsWith('msg_') && f.endsWith('.json')); } catch { return []; }

  const rawMsgs = [];
  for (const file of files) {
    const msg = readJson(path.join(sessionMsgDir, file));
    if (msg && msg.id) rawMsgs.push(msg);
  }
  rawMsgs.sort((a, b) => (a.time?.created || 0) - (b.time?.created || 0));

  const messages = [];
  for (const msg of rawMsgs) {
    const msgPartDir = path.join(PART_DIR, msg.id);
    const parts = [];
    if (fs.existsSync(msgPartDir)) {
      try {
        for (const pf of fs.readdirSync(msgPartDir).filter(f => f.startsWith('prt_') && f.endsWith('.json'))) {
          const part = readJson(path.join(msgPartDir, pf));
          if (part) parts.push(part);
        }
      } catch {}
    }

    const contentParts = [];
    const toolCalls = [];
    for (const part of parts) {
      if (part.type === 'text' && part.text) contentParts.push(part.text);
      else if ((part.type === 'tool-call' || part.type === 'tool_use') && part.name) {
        const argKeys = typeof part.input === 'object' ? Object.keys(part.input || {}).join(', ') : '';
        contentParts.push(`[tool-call: ${part.name}(${argKeys})]`);
        toolCalls.push({ name: part.name, args: part.input || {} });
      }
    }

    const content = contentParts.join('\n');
    if (!content) continue;

    const model = extractModelInfo(msg);
    const { inputTokens, outputTokens, cacheRead, cacheWrite } = extractTokenInfo(msg);
    messages.push({
      role: msg.role || 'assistant', content,
      _model: model, _inputTokens: inputTokens, _outputTokens: outputTokens,
      _cacheRead: cacheRead, _cacheWrite: cacheWrite, _toolCalls: toolCalls,
    });
  }
  return messages;
}

function getSqliteMessages(sessionId) {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(
      `SELECT m.id as msg_id, m.data as msg_data FROM message m WHERE m.session_id = ? ORDER BY m.time_created ASC`
    ).all(sessionId);

    const result = [];
    for (const row of rows) {
      let msgData;
      try { msgData = JSON.parse(row.msg_data); } catch { continue; }
      if (!msgData.role) continue;

      const parts = db.prepare(`SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC`).all(row.msg_id);
      const contentParts = [];
      const toolCalls = [];
      for (const part of parts) {
        let pd;
        try { pd = JSON.parse(part.data); } catch { continue; }
        if (pd.type === 'text' && pd.text) contentParts.push(pd.text);
        else if ((pd.type === 'tool-call' || pd.type === 'tool_use') && pd.name) {
          contentParts.push(`[tool-call: ${pd.name}]`);
          toolCalls.push({ name: pd.name, args: pd.input || {} });
        }
      }

      const content = contentParts.join('\n');
      if (!content) continue;

      const model = extractModelInfo(msgData);
      const { inputTokens, outputTokens, cacheRead, cacheWrite } = extractTokenInfo(msgData);
      result.push({
        role: msgData.role, content, _model: model,
        _inputTokens: inputTokens, _outputTokens: outputTokens,
        _cacheRead: cacheRead, _cacheWrite: cacheWrite, _toolCalls: toolCalls,
      });
    }
    db.close();
    return result;
  } catch { return []; }
}

function cleanTitle(title) {
  if (!title) return null;
  if (title.startsWith('New session - ')) return null;
  return title.substring(0, 120) || null;
}
