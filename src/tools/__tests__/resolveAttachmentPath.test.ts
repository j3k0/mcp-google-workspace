import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import * as path from 'path';
import { resolveAttachmentPath } from '../gmail-helpers.js';

let baseDir: string;
let prevEnv: string | undefined;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gsuite-attach-'));
  prevEnv = process.env.GMAIL_ATTACHMENTS_DIR;
  process.env.GMAIL_ATTACHMENTS_DIR = baseDir;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.GMAIL_ATTACHMENTS_DIR;
  else process.env.GMAIL_ATTACHMENTS_DIR = prevEnv;
  fs.rmSync(baseDir, { recursive: true, force: true });
});

test('resolves a simple relative path under the base directory', () => {
  const resolved = resolveAttachmentPath('file.pdf');
  const realBase = fs.realpathSync(baseDir);
  assert.equal(resolved, path.join(baseDir, 'file.pdf'));
  assert.ok(fs.realpathSync(path.dirname(resolved)) === realBase);
});

test('resolves a nested relative path and creates parent directories', () => {
  const resolved = resolveAttachmentPath(path.join('sub', 'deep', 'file.bin'));
  assert.equal(resolved, path.join(baseDir, 'sub', 'deep', 'file.bin'));
  assert.ok(fs.statSync(path.dirname(resolved)).isDirectory());
});

test('rejects absolute POSIX paths', () => {
  assert.throws(() => resolveAttachmentPath('/etc/passwd'), /Absolute save paths/);
});

test('rejects paths that traverse out of the base directory', () => {
  assert.throws(
    () => resolveAttachmentPath(path.join('..', 'escape.txt')),
    /escapes attachments directory/
  );
  assert.throws(
    () => resolveAttachmentPath(path.join('sub', '..', '..', 'escape.txt')),
    /escapes attachments directory/
  );
});

test('rejects empty path', () => {
  assert.throws(() => resolveAttachmentPath(''), /Invalid save path/);
});

test('rejects paths containing NUL bytes', () => {
  assert.throws(() => resolveAttachmentPath('file\0.txt'), /Invalid save path/);
});

test('rejects symlink that escapes the base directory', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gsuite-outside-'));
  try {
    fs.symlinkSync(outside, path.join(baseDir, 'evil'));
    assert.throws(
      () => resolveAttachmentPath(path.join('evil', 'pwn.txt')),
      /symlink/
    );
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('allows path that resolves exactly to the base directory itself only via subpath', () => {
  // Writing to a directory path (no filename) is nonsense; we just verify
  // the canonical happy-path: a filename directly under base resolves to base/filename.
  const resolved = resolveAttachmentPath('a.txt');
  assert.equal(path.dirname(resolved), baseDir);
});

test('honours updated GMAIL_ATTACHMENTS_DIR between calls', () => {
  const otherBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gsuite-attach2-'));
  try {
    process.env.GMAIL_ATTACHMENTS_DIR = otherBase;
    const resolved = resolveAttachmentPath('x.txt');
    assert.equal(resolved, path.join(otherBase, 'x.txt'));
  } finally {
    fs.rmSync(otherBase, { recursive: true, force: true });
  }
});
