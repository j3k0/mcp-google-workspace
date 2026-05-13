import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDraftEntry } from '../gmail-helpers.js';

test('returns minimal shape when message is null', () => {
  assert.deepEqual(formatDraftEntry('draft-1', null), {
    draft_id: 'draft-1',
    message_id: null,
  });
});

test('returns minimal shape when message is undefined', () => {
  assert.deepEqual(formatDraftEntry('draft-1', undefined), {
    draft_id: 'draft-1',
    message_id: null,
  });
});

test('returns minimal shape when message has no id', () => {
  assert.deepEqual(
    formatDraftEntry('draft-1', { threadId: 't', snippet: 'x' }),
    { draft_id: 'draft-1', message_id: null }
  );
});

test('returns full shape with lowercased headers', () => {
  const out = formatDraftEntry('draft-1', {
    id: 'msg-1',
    threadId: 'thread-1',
    internalDate: '1234567890',
    snippet: 'hello',
    payload: {
      headers: [
        { name: 'Subject', value: 'Test' },
        { name: 'From', value: 'a@b.com' },
        { name: 'To', value: 'c@d.com' },
      ],
    },
  });
  assert.equal(out.draft_id, 'draft-1');
  assert.equal(out.message_id, 'msg-1');
  assert.equal(out.threadId, 'thread-1');
  assert.equal(out.internalDate, '1234567890');
  assert.equal(out.snippet, 'hello');
  assert.deepEqual(out.headers, {
    subject: 'Test',
    from: 'a@b.com',
    to: 'c@d.com',
  });
});

test('skips headers with missing name or value', () => {
  const out = formatDraftEntry('draft-1', {
    id: 'msg-1',
    payload: {
      headers: [
        { name: 'Subject', value: 'Test' },
        { name: 'Empty' },
        { value: 'orphan' },
        { name: 'Blank', value: '' },
      ],
    },
  });
  assert.deepEqual(out.headers, { subject: 'Test' });
});

test('returns empty headers when payload is missing', () => {
  const out = formatDraftEntry('draft-1', { id: 'msg-1' });
  assert.deepEqual(out.headers, {});
});

test('returns empty headers when payload.headers is null', () => {
  const out = formatDraftEntry('draft-1', { id: 'msg-1', payload: { headers: null } });
  assert.deepEqual(out.headers, {});
});
