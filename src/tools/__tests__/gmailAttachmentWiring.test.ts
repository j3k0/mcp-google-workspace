import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GmailTools } from '../gmail.js';

// A message whose file part sits under multipart/alternative -> multipart/mixed,
// the shape Apple Mail produces for an "inline" attachment. The extraction
// itself is tested in extractAttachments.test.ts; these tests only prove that
// BOTH tools go through it (the original bug was one walk, copied twice, that
// recursed in neither place).
const nestedPayload = {
  mimeType: 'multipart/alternative',
  headers: [{ name: 'Subject', value: 'Retours Module Working corpus' }],
  parts: [
    { partId: '0', mimeType: 'text/plain', body: { data: 'aGVsbG8=' } },
    {
      partId: '1',
      mimeType: 'multipart/mixed',
      parts: [
        { partId: '1.0', mimeType: 'text/html', body: { data: 'PGI+aGk8L2I+' } },
        {
          partId: '1.1',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          filename: 'TestModuleCorpusTravail_18nov26.docx',
          body: { attachmentId: 'att-nested' },
        },
      ],
    },
  ],
};

function makeTools(): GmailTools {
  // Bypass the constructor: no OAuth client or network is involved in the
  // extraction path, only this.gmail.
  const tools = Object.create(GmailTools.prototype) as GmailTools;
  (tools as any).gmail = {
    users: {
      messages: {
        get: async ({ id }: { id: string }) => ({
          data: { id, threadId: 't-1', labelIds: ['INBOX'], payload: nestedPayload },
        }),
      },
    },
  };
  return tools;
}

test('gmail_get_email reports an attachment nested under multipart/alternative', async () => {
  const res = await makeTools().handleTool('gmail_get_email', { user_id: 'u', email_id: 'm-1' });
  const email = JSON.parse(res[0].text as string);
  assert.equal(email.hasAttachments, true);
  assert.deepEqual(Object.keys(email.attachments), ['TestModuleCorpusTravail_18nov26.docx']);
  assert.equal(email.attachments['TestModuleCorpusTravail_18nov26.docx'].attachmentId, 'att-nested');
});

test('gmail_bulk_get_emails reports the same nested attachment', async () => {
  const res = await makeTools().handleTool('gmail_bulk_get_emails', { user_id: 'u', email_ids: ['m-1'] });
  const emails = JSON.parse(res[0].text as string);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].hasAttachments, true);
  assert.deepEqual(Object.keys(emails[0].attachments), ['TestModuleCorpusTravail_18nov26.docx']);
  assert.equal(emails[0].attachments['TestModuleCorpusTravail_18nov26.docx'].attachmentId, 'att-nested');
});

test('a message with no attachment reports hasAttachments false on both tools', async () => {
  const tools = makeTools();
  (tools as any).gmail.users.messages.get = async ({ id }: { id: string }) => ({
    data: {
      id,
      threadId: 't-1',
      labelIds: [],
      payload: { mimeType: 'text/plain', body: { data: 'aGVsbG8=' } },
    },
  });

  const single = JSON.parse((await tools.handleTool('gmail_get_email', { user_id: 'u', email_id: 'm-2' }))[0].text as string);
  assert.equal(single.hasAttachments, false);
  assert.equal(single.attachments, undefined);

  const bulk = JSON.parse((await tools.handleTool('gmail_bulk_get_emails', { user_id: 'u', email_ids: ['m-2'] }))[0].text as string);
  assert.equal(bulk[0].hasAttachments, false);
  assert.equal(bulk[0].attachments, undefined);
});
