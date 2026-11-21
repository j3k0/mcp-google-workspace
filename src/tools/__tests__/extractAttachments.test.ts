import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAttachments, MessagePartLike } from '../gmail-helpers.js';

// Shape produced by Apple Mail when a file is added "inline": the file part
// sits under multipart/alternative -> multipart/mixed, not at the root.
const appleMailNested: MessagePartLike = {
  mimeType: 'multipart/alternative',
  parts: [
    { partId: '0', mimeType: 'text/plain', body: { size: 1774 } },
    {
      partId: '1',
      mimeType: 'multipart/mixed',
      parts: [
        { partId: '1.0', mimeType: 'text/html', body: { size: 872 } },
        {
          partId: '1.1',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          filename: 'TestModuleCorpusTravail_18nov26.docx',
          body: { attachmentId: 'ANGjdJ-nested', size: 358721 },
        },
        { partId: '1.2', mimeType: 'text/html', body: { size: 1611 } },
      ],
    },
  ],
};

test('finds an attachment nested under multipart/alternative', () => {
  const out = extractAttachments(appleMailNested);
  assert.deepEqual(Object.keys(out), ['TestModuleCorpusTravail_18nov26.docx']);
  assert.deepEqual(out['TestModuleCorpusTravail_18nov26.docx'], {
    filename: 'TestModuleCorpusTravail_18nov26.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    attachmentId: 'ANGjdJ-nested',
  });
});

test('finds several attachments nested two levels down', () => {
  const out = extractAttachments({
    mimeType: 'multipart/alternative',
    parts: [
      { partId: '0', mimeType: 'text/plain', body: { data: 'aGk=' } },
      {
        partId: '1',
        mimeType: 'multipart/mixed',
        parts: [
          {
            partId: '1.1',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            filename: 'Serboverb-server-documentation_2022.docx',
            body: { attachmentId: 'att-1' },
          },
          { partId: '1.2', mimeType: 'text/html', body: { data: 'aGk=' } },
          {
            partId: '1.3',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            filename: 'Serboverb-nginx-configuration_2022.docx',
            body: { attachmentId: 'att-2' },
          },
        ],
      },
    ],
  });
  assert.deepEqual(Object.keys(out).sort(), [
    'Serboverb-nginx-configuration_2022.docx',
    'Serboverb-server-documentation_2022.docx',
  ]);
  assert.equal(out['Serboverb-nginx-configuration_2022.docx'].attachmentId, 'att-2');
});

test('keeps finding attachments that are direct children of the root', () => {
  const out = extractAttachments({
    mimeType: 'multipart/mixed',
    parts: [
      { partId: '0', mimeType: 'text/plain', body: { data: 'aGk=' } },
      { partId: '1', mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'pdf-1' } },
      { partId: '2', mimeType: 'image/png', filename: 'b.png', body: { attachmentId: 'png-2' } },
    ],
  });
  assert.deepEqual(Object.keys(out), ['a.pdf', 'b.png']);
});

test('lists inline (cid:) images like any other attachment', () => {
  const out = extractAttachments({
    mimeType: 'multipart/related',
    parts: [
      { partId: '0', mimeType: 'text/html', body: { data: 'aGk=' } },
      { partId: '1', mimeType: 'image/png', filename: 'logo.png', body: { attachmentId: 'img-1' } },
    ],
  });
  assert.deepEqual(Object.keys(out), ['logo.png']);
});

test('falls back to partId, then unnamed, when there is no filename', () => {
  const out = extractAttachments({
    mimeType: 'multipart/mixed',
    parts: [
      { partId: '1', mimeType: 'application/octet-stream', body: { attachmentId: 'x-1' } },
      { mimeType: 'application/octet-stream', body: { attachmentId: 'x-2' } },
    ],
  });
  assert.deepEqual(Object.keys(out), ['1', 'unnamed']);
  assert.equal(out['1'].attachmentId, 'x-1');
  assert.equal(out['unnamed'].attachmentId, 'x-2');
});

test('repeated filenames do not shadow each other', () => {
  const out = extractAttachments({
    mimeType: 'multipart/mixed',
    parts: [
      { partId: '1', mimeType: 'image/png', filename: 'image.png', body: { attachmentId: 'a' } },
      { partId: '2', mimeType: 'image/png', filename: 'image.png', body: { attachmentId: 'b' } },
      { partId: '3', mimeType: 'image/png', filename: 'image.png', body: { attachmentId: 'c' } },
    ],
  });
  assert.deepEqual(Object.keys(out), ['image.png', 'image.png#2', 'image.png#3']);
  assert.deepEqual(
    Object.values(out).map(a => a.attachmentId),
    ['a', 'b', 'c']
  );
});

test('walks deeply nested multipart trees', () => {
  const out = extractAttachments({
    mimeType: 'multipart/mixed',
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: 'aGk=' } },
          {
            mimeType: 'multipart/related',
            parts: [{ mimeType: 'multipart/mixed', parts: [
              { mimeType: 'image/jpeg', filename: 'deep.jpg', body: { attachmentId: 'deep' } },
            ] }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(Object.keys(out), ['deep.jpg']);
});

test('returns an empty record for messages without attachments', () => {
  assert.deepEqual(extractAttachments({ mimeType: 'text/plain', body: { data: 'aGk=' } }), {});
  assert.deepEqual(extractAttachments({}), {});
  assert.deepEqual(extractAttachments(null), {});
  assert.deepEqual(extractAttachments(undefined), {});
});
