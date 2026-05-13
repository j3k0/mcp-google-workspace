import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { decodeBase64Data } from '../gmail.js';

test('decodes standard base64 ASCII payload', () => {
  const input = Buffer.from('Hello, world!', 'utf-8').toString('base64');
  assert.equal(decodeBase64Data(input).toString('utf-8'), 'Hello, world!');
});

test('decodes URL-safe base64 (- and _ instead of + and /)', () => {
  // 0xFB 0xFF 0xBF -> standard base64 "+/+/" -> url-safe "-_-_"
  const raw = Buffer.from([0xfb, 0xff, 0xbf, 0xfb, 0xff, 0xbf]);
  const urlSafe = raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  assert.ok(urlSafe.includes('-') || urlSafe.includes('_'));
  assert.deepEqual(decodeBase64Data(urlSafe), raw);
});

test('decodes payload with missing padding', () => {
  // "any carnal pleas" -> base64 ends with no '='; strip any '=' to simulate Gmail-style output
  const raw = Buffer.from('any carnal pleas', 'utf-8');
  const stripped = raw.toString('base64').replace(/=+$/, '');
  assert.deepEqual(decodeBase64Data(stripped), raw);
});

test('preserves binary bytes (PDF magic number)', () => {
  // %PDF-1.4\n
  const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
  const encoded = pdfHeader.toString('base64');
  const decoded = decodeBase64Data(encoded);
  assert.deepEqual(decoded, pdfHeader);
  assert.equal(decoded.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('round-trips arbitrary binary payload', () => {
  const random = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const urlSafe = random
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.deepEqual(decodeBase64Data(urlSafe), random);
});

test('returns empty Buffer for empty input', () => {
  assert.deepEqual(decodeBase64Data(''), Buffer.alloc(0));
});
