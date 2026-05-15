import { Buffer } from 'buffer';
import fs from 'fs';
import os from 'os';
import * as path from 'path';
import { marked } from 'marked';

export function decodeBase64Data(fileData: string): Buffer {
  const standardBase64Data = fileData.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - standardBase64Data.length % 4) % 4);
  return Buffer.from(standardBase64Data + padding, 'base64');
}

function getAttachmentsBaseDir(): string {
  const fromEnv = process.env.GMAIL_ATTACHMENTS_DIR;
  const baseDir = fromEnv && fromEnv.length > 0
    ? path.resolve(fromEnv)
    : path.join(os.homedir(), '.mcp-gsuite', 'attachments');
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

/**
 * Resolves a caller-supplied attachment filename against the configured
 * attachments base directory (GMAIL_ATTACHMENTS_DIR, defaulting to
 * ~/.mcp-gsuite/attachments). Absolute paths, traversal, NUL bytes and
 * symlink escapes are rejected.
 */
export function resolveAttachmentPath(filePath: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.includes('\0')) {
    throw new Error('Invalid save path');
  }
  if (path.isAbsolute(filePath)) {
    throw new Error(
      `Absolute save paths are not allowed; provide a relative path under GMAIL_ATTACHMENTS_DIR (got: ${filePath})`
    );
  }
  const baseDir = getAttachmentsBaseDir();
  const resolved = path.resolve(baseDir, filePath);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    throw new Error(`Save path escapes attachments directory: ${filePath}`);
  }
  const parent = path.dirname(resolved);
  fs.mkdirSync(parent, { recursive: true });
  const realBase = fs.realpathSync(baseDir);
  const realParent = fs.realpathSync(parent);
  if (realParent !== realBase && !realParent.startsWith(realBase + path.sep)) {
    throw new Error(`Save path escapes attachments directory via symlink: ${filePath}`);
  }
  return resolved;
}

interface MessageHeaderLike {
  name?: string | null;
  value?: string | null;
}

export interface DraftMessageLike {
  id?: string | null;
  threadId?: string | null;
  internalDate?: string | null;
  snippet?: string | null;
  payload?: {
    headers?: MessageHeaderLike[] | null;
  } | null;
}

export interface DraftEntry {
  draft_id: string;
  message_id: string | null;
  threadId?: string | null;
  internalDate?: string | null;
  snippet?: string | null;
  headers?: Record<string, string>;
}

export type EmailBodyType = 'plain' | 'html' | 'markdown';

export interface RenderedEmailBody {
  contentType: 'text/plain' | 'text/html';
  body: string;
}

/**
 * Renders the agent-supplied body into the MIME body + Content-Type the
 * Gmail API should see. 'plain' is passthrough (current behavior),
 * 'html' is passthrough as text/html, 'markdown' is rendered to HTML
 * via marked. Defaults to 'plain' when the input is omitted/unknown so
 * existing callers see no behavior change.
 */
export function renderEmailBody(body: string, bodyType: EmailBodyType | string | undefined): RenderedEmailBody {
  switch (bodyType) {
    case 'html':
      return { contentType: 'text/html', body };
    case 'markdown':
      return { contentType: 'text/html', body: marked.parse(body, { async: false }) as string };
    case 'plain':
    default:
      return { contentType: 'text/plain', body };
  }
}

/**
 * Shapes a single (draft, message) pair into the public response entry
 * for gmail_list_drafts. Headers are lowercased; entries with no
 * underlying message return a minimal { draft_id, message_id: null }.
 */
export function formatDraftEntry(draftId: string, message: DraftMessageLike | null | undefined): DraftEntry {
  if (!message || !message.id) {
    return { draft_id: draftId, message_id: null };
  }
  const headers: Record<string, string> = {};
  message.payload?.headers?.forEach(h => {
    if (h.name && h.value) headers[h.name.toLowerCase()] = h.value;
  });
  return {
    draft_id: draftId,
    message_id: message.id,
    threadId: message.threadId,
    internalDate: message.internalDate,
    snippet: message.snippet,
    headers,
  };
}
