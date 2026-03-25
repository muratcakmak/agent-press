import path from 'path';
import fs from 'fs';
import os from 'os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

export const name = 'claude-code';
export const label = 'Claude Code';
export const color = '#f97316';

export function getChats() {
  const chats = [];
  if (!fs.existsSync(PROJECTS_DIR)) return chats;

  for (const projDir of fs.readdirSync(PROJECTS_DIR)) {
    const dir = path.join(PROJECTS_DIR, projDir);
    if (!fs.statSync(dir).isDirectory()) continue;

    const decodedFolder = projDir.replace(/-/g, '/');

    // Read sessions-index.json
    const indexPath = path.join(dir, 'sessions-index.json');
    const indexed = new Map();
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      for (const entry of index.entries || []) {
        indexed.set(entry.sessionId, entry);
      }
    } catch { /* no index */ }

    let files;
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const fullPath = path.join(dir, file);
      const entry = indexed.get(sessionId);

      if (entry) {
        chats.push({
          source: 'claude-code',
          composerId: sessionId,
          name: cleanPrompt(entry.firstPrompt),
          createdAt: entry.created ? new Date(entry.created).getTime() : null,
          lastUpdatedAt: entry.modified ? new Date(entry.modified).getTime() : null,
          mode: 'claude',
          folder: entry.projectPath || decodedFolder,
          bubbleCount: entry.messageCount || 0,
          _fullPath: fullPath,
        });
      } else {
        try {
          const stat = fs.statSync(fullPath);
          const meta = peekSessionMeta(fullPath);
          chats.push({
            source: 'claude-code',
            composerId: sessionId,
            name: meta.firstPrompt ? cleanPrompt(meta.firstPrompt) : null,
            createdAt: meta.timestamp || stat.birthtime.getTime(),
            lastUpdatedAt: stat.mtime.getTime(),
            mode: 'claude',
            folder: meta.cwd || decodedFolder,
            bubbleCount: 0,
            _fullPath: fullPath,
          });
        } catch { /* skip */ }
      }

      indexed.delete(sessionId);
    }

    // Indexed sessions whose .jsonl still exists elsewhere
    for (const [sessionId, entry] of indexed) {
      if (!entry.fullPath || !fs.existsSync(entry.fullPath)) continue;
      chats.push({
        source: 'claude-code',
        composerId: sessionId,
        name: cleanPrompt(entry.firstPrompt),
        createdAt: entry.created ? new Date(entry.created).getTime() : null,
        lastUpdatedAt: entry.modified ? new Date(entry.modified).getTime() : null,
        mode: 'claude',
        folder: entry.projectPath || decodedFolder,
        bubbleCount: entry.messageCount || 0,
        _fullPath: entry.fullPath,
      });
    }
  }

  return chats;
}

export function getMessages(chat) {
  const filePath = chat._fullPath;
  if (!filePath || !fs.existsSync(filePath)) return [];

  const messages = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (obj.type === 'user' && obj.message) {
      const content = extractContent(obj.message.content);
      if (content) messages.push({ role: 'user', content });
    } else if (obj.type === 'assistant' && obj.message) {
      const { text, toolCalls } = extractAssistantContent(obj.message.content);
      const usage = obj.message.usage;
      if (text) messages.push({
        role: 'assistant', content: text, _model: obj.message.model,
        _inputTokens: usage?.input_tokens, _outputTokens: usage?.output_tokens,
        _cacheRead: usage?.cache_read_input_tokens, _cacheWrite: usage?.cache_creation_input_tokens,
        _toolCalls: toolCalls,
      });
    }
  }

  return messages;
}

function peekSessionMeta(filePath) {
  const meta = { firstPrompt: null, cwd: null, timestamp: null };
  try {
    const buf = fs.readFileSync(filePath, 'utf-8');
    for (const line of buf.split('\n')) {
      if (!line) continue;
      const obj = JSON.parse(line);
      if (!meta.cwd && obj.cwd) meta.cwd = obj.cwd;
      if (!meta.timestamp && obj.timestamp) {
        meta.timestamp = typeof obj.timestamp === 'string'
          ? new Date(obj.timestamp).getTime() : obj.timestamp;
      }
      if (!meta.firstPrompt && obj.type === 'user' && obj.message?.content) {
        const text = typeof obj.message.content === 'string'
          ? obj.message.content
          : obj.message.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
        meta.firstPrompt = text.substring(0, 200);
      }
      if (meta.cwd && meta.firstPrompt) break;
    }
  } catch {}
  return meta;
}

function cleanPrompt(prompt) {
  if (!prompt || prompt === 'No prompt') return null;
  return prompt
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 120) || null;
}

function extractContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
}

function extractAssistantContent(content) {
  if (typeof content === 'string') return { text: content, toolCalls: [] };
  if (!Array.isArray(content)) return { text: '', toolCalls: [] };
  const parts = [];
  const toolCalls = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      parts.push(block.text);
    } else if (block.type === 'tool_use') {
      const args = block.input || {};
      const argKeys = Object.keys(args).join(', ');
      parts.push(`[tool-call: ${block.name || 'unknown'}(${argKeys})]`);
      toolCalls.push({ name: block.name || 'unknown', args });
    }
  }
  return { text: parts.join('\n') || '', toolCalls };
}
