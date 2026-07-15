import { Tool, TextContent, ImageContent, EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';
import { GAuthService } from '../services/gauth.js';
import { google } from 'googleapis';
import { USER_ID_ARG } from '../types/tool-handler.js';
import { Buffer } from 'buffer';
import fs from 'fs';
import { decodeBase64Data, formatDraftEntry, renderEmailBody, resolveAttachmentPath } from './gmail-helpers.js';

export { decodeBase64Data, formatDraftEntry, renderEmailBody, resolveAttachmentPath } from './gmail-helpers.js';

export class GmailTools {
  private gmail: ReturnType<typeof google.gmail>;

  constructor(private gauth: GAuthService) {
    this.gmail = google.gmail({ version: 'v1', auth: this.gauth.getClient() });
  }

  // Helper methods for email content extraction
  private decodeBase64UrlString(base64UrlString: string): string {
    try {
      return decodeBase64Data(base64UrlString).toString('utf-8');
    } catch (error) {
      console.error('Error decoding base64 string:', error);
      return '[Error decoding content]';
    }
  }

  /**
   * Strips CR and LF characters from email header values to prevent header injection.
   */
  private sanitizeHeader(value: string): string {
    return value.replace(/[\r\n]/g, '');
  }

  private validateSavePath(filePath: string): string {
    return resolveAttachmentPath(filePath);
  }

  private extractEmailText(payload: any): string {
    // For simple text emails
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return this.decodeBase64UrlString(payload.body.data);
    }

    // For HTML-only emails, we'll still return the HTML content
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      return this.decodeBase64UrlString(payload.body.data);
    }

    // For multipart emails, look for text/plain part first, then text/html
    if (payload.parts && Array.isArray(payload.parts)) {
      // First try to find text/plain part
      const textPart = payload.parts.find((part: any) => part.mimeType === 'text/plain');
      if (textPart && textPart.body?.data) {
        return this.decodeBase64UrlString(textPart.body.data);
      }

      // If no text/plain, try text/html
      const htmlPart = payload.parts.find((part: any) => part.mimeType === 'text/html');
      if (htmlPart && htmlPart.body?.data) {
        return this.decodeBase64UrlString(htmlPart.body.data);
      }

      // Recursively check nested multipart structures
      for (const part of payload.parts) {
        if (part.parts) {
          const nestedText = this.extractEmailText(part);
          if (nestedText) {
            return nestedText;
          }
        }
      }
    }

    return '';
  }

  private extractEmailHeaders(headers: any[]): Record<string, string> {
    const result: Record<string, string> = {};
    const importantHeaders = ['from', 'to', 'cc', 'bcc', 'subject', 'date', 'reply-to'];
    
    if (headers && Array.isArray(headers)) {
      headers.forEach(header => {
        if (header.name && header.value) {
          const headerName = header.name.toLowerCase();
          if (importantHeaders.includes(headerName)) {
            result[headerName] = header.value;
          }
        }
      });
    }
    return result;
  }

  getTools(): Tool[] {
    return ([
      {
        name: 'gmail_list_accounts',
        description: 'Lists all configured Google accounts that can be used with the Gmail tools. This tool does not require a user_id as it lists available accounts before selection.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
          required: []
        }
      } as Tool,
      {
        name: 'gmail_query_emails',
        description: `Query Gmail emails based on an optional search query. 
        Returns emails in reverse chronological order (newest first).
        Returns metadata such as subject and also a short summary of the content.`,
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            query: {
              type: 'string',
              description: `Gmail search query (optional). Examples:
                - a $string: Search email body, subject, and sender information for $string
                - 'is:unread' for unread emails
                - 'from:example@gmail.com' for emails from a specific sender
                - 'newer_than:2d' for emails from last 2 days
                - 'has:attachment' for emails with attachments
                If not provided, returns recent emails without filtering.`
            },
            max_results: {
              type: 'integer',
              description: 'Maximum number of emails to retrieve (1-500)',
              minimum: 1,
              maximum: 500,
              default: 100
            }
          },
          required: [USER_ID_ARG]
        }
      },
      {
        name: 'gmail_get_email',
        description: 'Retrieves a complete Gmail email message by its ID, including the full message body and attachment IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            email_id: {
              type: 'string',
              description: 'The ID of the Gmail message to retrieve'
            }
          },
          required: ['email_id', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_bulk_get_emails',
        description: 'Retrieves multiple Gmail email messages by their IDs in a single request, including the full message bodies and attachment IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            email_ids: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of Gmail message IDs to retrieve'
            }
          },
          required: ['email_ids', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_create_draft',
        description: `Creates a draft email message from scratch in Gmail with specified recipient, subject, body, and optional CC recipients.
        
        Do NOT use this tool when you want to draft or send a REPLY to an existing message. This tool does NOT include any previous message content. Use the reply_gmail_email tool
        with send=false instead.`,
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            to: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } }
              ],
              description: 'Email address of the recipient, or list of email addresses'
            },
            subject: {
              type: 'string',
              description: 'Subject line of the email'
            },
            body: {
              type: 'string',
              description: 'Body content of the email'
            },
            cc: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Optional list of email addresses to CC'
            },
            body_type: {
              type: 'string',
              enum: ['plain', 'html', 'markdown'],
              default: 'plain',
              description: 'How to interpret `body`. "plain" sends as text/plain (default, current behavior). "html" sends the body verbatim as text/html. "markdown" renders the body to HTML and sends as text/html.'
            }
          },
          required: ['to', 'subject', 'body', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_delete_draft',
        description: 'Deletes a Gmail draft message by its ID. This action cannot be undone.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            draft_id: {
              type: 'string',
              description: 'The ID of the draft to delete'
            }
          },
          required: ['draft_id', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_list_drafts',
        description: `Lists Gmail drafts for the user. Returns each draft's draft_id (required for gmail_delete_draft) along with its message_id, threadId, subject, recipients, and a snippet.

        Use this tool before calling gmail_delete_draft, since drafts.list returns a distinct draft_id that is different from the message_id returned by gmail_query_emails.`,
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            query: {
              type: 'string',
              description: 'Optional Gmail search query to filter drafts (same syntax as gmail_query_emails, e.g. "before:2020/01/01", "to:alice@example.com").'
            },
            max_results: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              default: 100,
              description: 'Maximum number of drafts to return (1-500). Defaults to 100.'
            }
          },
          required: [USER_ID_ARG]
        }
      },
      {
        name: 'gmail_reply',
        description: process.env.GMAIL_ALLOW_SENDING === 'true'
          ? `Creates a reply to an existing Gmail email message and either sends it or saves as draft.

        Use this tool if you want to draft a reply. Use the 'cc' argument if you want to perform a "reply all".`
          : `Creates a draft reply to an existing Gmail email message. Sending is disabled, only drafts can be created (send must be false).

        Use this tool if you want to draft a reply. Use the 'cc' argument if you want to perform a "reply all".`,
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            original_message_id: {
              type: 'string',
              description: 'The ID of the Gmail message to reply to'
            },
            reply_body: {
              type: 'string',
              description: 'The body content of your reply message'
            },
            send: {
              type: 'boolean',
              description: 'If true, sends the reply immediately. If false, saves as draft.',
              default: false
            },
            cc: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Optional list of email addresses to CC on the reply'
            },
            body_type: {
              type: 'string',
              enum: ['plain', 'html', 'markdown'],
              default: 'plain',
              description: 'How to interpret `reply_body`. "plain" sends as text/plain (default, current behavior). "html" sends the body verbatim as text/html. "markdown" renders the body to HTML and sends as text/html.'
            }
          },
          required: ['original_message_id', 'reply_body', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_get_attachment',
        description: 'Retrieves a Gmail attachment by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            message_id: {
              type: 'string',
              description: 'The ID of the Gmail message containing the attachment'
            },
            attachment_id: {
              type: 'string',
              description: 'The ID of the attachment to retrieve'
            },
            mime_type: {
              type: 'string',
              description: 'The MIME type of the attachment'
            },
            filename: {
              type: 'string',
              description: 'The filename of the attachment'
            },
            save_to_disk: {
              type: 'string',
              description: 'Relative path (under GMAIL_ATTACHMENTS_DIR, default ~/.mcp-gsuite/attachments) where the attachment is written. Absolute paths and traversal (e.g. "../") are rejected. If not provided, the attachment is returned as a resource.'
            }
          },
          required: ['message_id', 'attachment_id', 'mime_type', 'filename', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_bulk_save_attachments',
        description: 'Saves multiple Gmail attachments to disk by their message IDs and attachment IDs in a single request.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            attachments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  message_id: {
                    type: 'string',
                    description: 'ID of the Gmail message containing the attachment'
                  },
                  attachment_id: {
                    type: 'string',
                    description: 'The attachmentId of the attachment, as returned in the attachments map by gmail_get_email / gmail_bulk_get_emails (not the numeric part-index key of that map)'
                  },
                  save_path: {
                    type: 'string',
                    description: 'Relative path (under GMAIL_ATTACHMENTS_DIR, default ~/.mcp-gsuite/attachments) where the attachment is written. Absolute paths and traversal (e.g. "../") are rejected.'
                  }
                },
                required: ['message_id', 'attachment_id', 'save_path']
              }
            }
          },
          required: ['attachments', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_archive',
        description: 'Archives a Gmail message by removing it from the inbox.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            message_id: {
              type: 'string',
              description: 'The ID of the Gmail message to archive'
            }
          },
          required: ['message_id', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_bulk_archive',
        description: 'Archives multiple Gmail messages by removing them from the inbox.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            message_ids: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of Gmail message IDs to archive'
            }
          },
          required: ['message_ids', USER_ID_ARG]
        }
      },
      {
        name: 'gmail_list_labels',
        description: 'Lists the Gmail labels in the account, returning each label\'s id, name, and type (system or user). Use this to discover the label IDs needed by gmail_bulk_modify (user-defined labels must be referenced by id, not name).',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            }
          },
          required: [USER_ID_ARG]
        }
      },
      {
        name: 'gmail_bulk_modify',
        description: `Adds and/or removes labels on many Gmail messages in a SINGLE batch request (Gmail users.messages.batchModify), up to 1000 message IDs per request. Lists longer than 1000 are automatically split into multiple batch requests. This is the efficient way to bulk-trash, bulk-archive, or relabel — unlike gmail_bulk_archive it does not issue one request per message.

        Use label IDs (not names). Common system label IDs: 'TRASH' (move to trash), 'INBOX' (present = in inbox; remove it to archive, add it to move back to inbox), 'UNREAD', 'STARRED', 'IMPORTANT', 'SPAM'. Get user-defined label IDs from gmail_list_labels.

        Examples:
        - Move to trash: add_labels: ["TRASH"]
        - Archive (remove from inbox): remove_labels: ["INBOX"]
        - Mark read: remove_labels: ["UNREAD"]
        - Apply a user label and archive: add_labels: ["Label_123"], remove_labels: ["INBOX"]

        Provide at least one of add_labels or remove_labels.`,
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            message_ids: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of Gmail message IDs to modify (max 1000 per underlying request; longer lists are split automatically).'
            },
            add_labels: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Label IDs to add to every message (optional). E.g. ["TRASH"] or a user label id from gmail_list_labels.'
            },
            remove_labels: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Label IDs to remove from every message (optional). E.g. ["INBOX"] to archive, ["UNREAD"] to mark read.'
            }
          },
          required: ['message_ids', USER_ID_ARG]
        }
      }
    ] as Tool[]).filter(tool => (
      (process.env.GMAIL_ALLOW_SENDING === 'true' || process.env.GMAIL_ALLOW_DRAFTS === 'true')
      ? true
      : (tool.name !== 'gmail_reply' && tool.name !== 'gmail_create_draft')));
  }

  async handleTool(name: string, args: Record<string, any>): Promise<Array<TextContent | ImageContent | EmbeddedResource>> {
    switch (name) {
      case 'gmail_list_accounts':
        return this.listAccounts();
      case 'gmail_query_emails':
        return this.queryEmails(args);
      case 'gmail_get_email':
        return this.getEmailById(args);
      case 'gmail_bulk_get_emails':
        return this.bulkGetEmails(args);
      case 'gmail_create_draft':
        return this.createDraft(args);
      case 'gmail_delete_draft':
        return this.deleteDraft(args);
      case 'gmail_list_drafts':
        return this.listDrafts(args);
      case 'gmail_reply':
        return this.reply(args);
      case 'gmail_get_attachment':
        return this.getAttachment(args);
      case 'gmail_bulk_save_attachments':
        return this.bulkSaveAttachments(args);
      case 'gmail_archive':
        return this.archive(args);
      case 'gmail_bulk_archive':
        return this.bulkArchive(args);
      case 'gmail_list_labels':
        return this.listLabels(args);
      case 'gmail_bulk_modify':
        return this.bulkModify(args);
      // Add other tool handlers here...
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async listAccounts(): Promise<Array<TextContent>> {
    try {
      const accounts = await this.gauth.getAccountInfo();
      const accountList = accounts.map(account => ({
        email: account.email,
        accountType: account.accountType,
        extraInfo: account.extraInfo,
        description: account.toDescription()
      }));

      if (accountList.length === 0) {
        return [{
          type: 'text',
          text: JSON.stringify({
            message: 'No accounts configured. Please check your .accounts.json file.',
            accounts: []
          }, null, 2)
        }];
      }

      return [{
        type: 'text',
        text: JSON.stringify({
          message: `Found ${accountList.length} configured account(s)`,
          accounts: accountList
        }, null, 2)
      }];
    } catch (error) {
      console.error('Error listing accounts:', error);
      return [{
        type: 'text',
        text: JSON.stringify({
          error: `Failed to list accounts: ${(error as Error).message}`,
          accounts: []
        }, null, 2)
      }];
    }
  }

  private async queryEmails(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }

    try {
      const response = await this.gmail.users.messages.list({
        userId,
        q: args.query,
        maxResults: args.max_results || 100
      });

      const messages = response.data.messages || [];
      const emails = await Promise.all(
        messages.map(async (msg) => {
          const email = await this.gmail.users.messages.get({
            userId,
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date']
          });

          // Extract headers into a more readable format
          const headers: Record<string, string> = {};
          email.data.payload?.headers?.forEach(header => {
            if (header.name && header.value) {
              headers[header.name.toLowerCase()] = header.value;
            }
          });

          return {
            id: email.data.id,
            threadId: email.data.threadId,
            labelIds: email.data.labelIds,
            snippet: email.data.snippet,
            internalDate: email.data.internalDate,
            headers
          };
        })
      );

      return [{
        type: 'text',
        text: JSON.stringify(emails, null, 2)
      }];
    } catch (error) {
      console.error('Error querying emails:', error);
      throw error;
    }
  }

  private async getEmailById(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const emailId = args.email_id;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!emailId) {
      throw new Error('Missing required argument: email_id');
    }

    try {
      const email = await this.gmail.users.messages.get({
        userId,
        id: emailId,
        format: 'full'
      });

      // Extract headers
      const headers = this.extractEmailHeaders(email.data.payload?.headers || []);
      
      // Extract text content
      const textContent = this.extractEmailText(email.data.payload || {});

      // Get attachments if any
      const attachments: Record<string, any> = {};
      if (email.data.payload?.parts) {
        for (const part of email.data.payload.parts) {
          if (part.body?.attachmentId) {
            attachments[part.partId!] = {
              filename: part.filename,
              mimeType: part.mimeType,
              attachmentId: part.body.attachmentId
            };
          }
        }
      }

      // Create simplified email object
      const result = {
        id: email.data.id,
        threadId: email.data.threadId,
        labelIds: email.data.labelIds,
        headers,
        textContent,
        hasAttachments: Object.keys(attachments).length > 0,
        attachments: Object.keys(attachments).length > 0 ? attachments : undefined
      };

      return [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }];
    } catch (error) {
      console.error('Error getting email:', error);
      throw error;
    }
  }

  private async bulkGetEmails(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const emailIds = args.email_ids;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!emailIds || emailIds.length === 0) {
      throw new Error('Missing required argument: email_ids');
    }

    try {
      const emails = await Promise.all(
        emailIds.map(async (emailId: string) => {
          const email = await this.gmail.users.messages.get({
            userId,
            id: emailId,
            format: 'full'
          });

          // Extract headers
          const headers = this.extractEmailHeaders(email.data.payload?.headers || []);
          
          // Extract text content
          const textContent = this.extractEmailText(email.data.payload || {});

          // Get attachments if any
          const attachments: Record<string, any> = {};
          if (email.data.payload?.parts) {
            for (const part of email.data.payload.parts) {
              if (part.body?.attachmentId) {
                attachments[part.partId!] = {
                  filename: part.filename,
                  mimeType: part.mimeType,
                  attachmentId: part.body.attachmentId
                };
              }
            }
          }

          // Create simplified email object
          return {
            id: email.data.id,
            threadId: email.data.threadId,
            labelIds: email.data.labelIds,
            headers,
            textContent,
            hasAttachments: Object.keys(attachments).length > 0,
            attachments: Object.keys(attachments).length > 0 ? attachments : undefined
          };
        })
      );

      return [{
        type: 'text',
        text: JSON.stringify(emails, null, 2)
      }];
    } catch (error) {
      console.error('Error getting emails:', error);
      throw error;
    }
  }

  private async createDraft(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const to = Array.isArray(args.to) ? args.to.join(', ') : args.to;
    const subject = args.subject;
    const body = args.body;
    const cc = args.cc || [];

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!to) {
      throw new Error('Missing required argument: to');
    }
    if (!subject) {
      throw new Error('Missing required argument: subject');
    }
    if (!body) {
      throw new Error('Missing required argument: body');
    }

    try {
      const rendered = renderEmailBody(body, args.body_type);
      const message = {
        raw: Buffer.from(
          `To: ${this.sanitizeHeader(to)}\r\n` +
          `Subject: ${this.sanitizeHeader(subject)}\r\n` +
          `Cc: ${cc.map((c: string) => this.sanitizeHeader(c)).join(', ')}\r\n` +
          `Content-Type: ${rendered.contentType}; charset="UTF-8"\r\n` +
          `\r\n` +
          `${rendered.body}`
        ).toString('base64url')
      };

      const draft = await this.gmail.users.drafts.create({
        userId,
        requestBody: {
          message
        }
      });

      return [{
        type: 'text',
        text: JSON.stringify(draft.data, null, 2)
      }];
    } catch (error) {
      console.error('Error creating draft:', error);
      throw error;
    }
  }

  private async listDrafts(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }

    try {
      const response = await this.gmail.users.drafts.list({
        userId,
        q: args.query,
        maxResults: args.max_results || 100
      });

      const drafts = response.data.drafts || [];
      const settled = await Promise.allSettled(
        drafts.map(async (d) => {
          const messageId = d.message?.id;
          if (!messageId) return null;
          const msg = await this.gmail.users.messages.get({
            userId,
            id: messageId,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date']
          });
          return msg.data;
        })
      );

      const enriched = settled.map((result, i) => {
        const draftId = drafts[i].id ?? '';
        if (result.status === 'fulfilled') {
          return formatDraftEntry(draftId, result.value);
        }
        return {
          draft_id: draftId,
          message_id: drafts[i].message?.id ?? null,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      });

      return [{
        type: 'text',
        text: JSON.stringify(enriched, null, 2)
      }];
    } catch (error) {
      console.error('Error listing drafts:', error);
      throw error;
    }
  }

  private async deleteDraft(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const draftId = args.draft_id;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!draftId) {
      throw new Error('Missing required argument: draft_id');
    }

    try {
      await this.gmail.users.drafts.delete({
        userId,
        id: draftId
      });

      return [{
        type: 'text',
        text: `Draft ${draftId} deleted successfully`
      }];
    } catch (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  }

  private async reply(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const originalMessageId = args.original_message_id;
    const replyBody = args.reply_body;
    const send = (process.env.GMAIL_ALLOW_SENDING === 'true') ? (args.send || false) : false;
    const cc = args.cc || [];

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!originalMessageId) {
      throw new Error('Missing required argument: original_message_id');
    }
    if (!replyBody) {
      throw new Error('Missing required argument: reply_body');
    }

    try {
      // First get the original message to extract headers
      const originalMessage = await this.gmail.users.messages.get({
        userId,
        id: originalMessageId
      });

      const headers = originalMessage.data.payload?.headers?.reduce((acc: Record<string, string>, header) => {
        if (header.name && header.value) {
          acc[header.name.toLowerCase()] = header.value;
        }
        return acc;
      }, {});

      if (!headers) {
        throw new Error('Could not extract headers from original message');
      }

      // Get the threadId from the original message
      const threadId = originalMessage.data.threadId;
      if (!threadId) {
        throw new Error('Could not extract threadId from original message');
      }

      const rendered = renderEmailBody(replyBody, args.body_type);
      const message = {
        raw: Buffer.from(
          `In-Reply-To: ${this.sanitizeHeader(originalMessageId)}\r\n` +
          `References: ${this.sanitizeHeader(originalMessageId)}\r\n` +
          `Subject: Re: ${this.sanitizeHeader(headers.subject || '')}\r\n` +
          `To: ${this.sanitizeHeader(headers.from || '')}\r\n` +
          `Cc: ${cc.map((c: string) => this.sanitizeHeader(c)).join(', ')}\r\n` +
          `Content-Type: ${rendered.contentType}; charset="UTF-8"\r\n` +
          `\r\n` +
          `${rendered.body}`
        ).toString('base64url'),
        threadId: threadId
      };

      if (send) {
        await this.gmail.users.messages.send({
          userId,
          requestBody: {
            raw: message.raw,
            threadId: message.threadId
          }
        });
        return [{
          type: 'text',
          text: 'Reply sent successfully'
        }];
      } else {
        const draft = await this.gmail.users.drafts.create({
          userId,
          requestBody: {
            message
          }
        });
        return [{
          type: 'text',
          text: JSON.stringify(draft.data, null, 2)
        }];
      }
    } catch (error) {
      console.error('Error replying to email:', error);
      throw error;
    }
  }

  private async getAttachment(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const messageId = args.message_id;
    const attachmentId = args.attachment_id;
    const mimeType = args.mime_type;
    const filename = args.filename;
    const saveToDisk = args.save_to_disk;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!messageId) {
      throw new Error('Missing required argument: message_id');
    }
    if (!attachmentId) {
      throw new Error('Missing required argument: attachment_id');
    }
    if (!mimeType) {
      throw new Error('Missing required argument: mime_type');
    }
    if (!filename) {
      throw new Error('Missing required argument: filename');
    }

    try {
      const attachment = await this.gmail.users.messages.attachments.get({
        userId,
        messageId,
        id: attachmentId
      });

      const attachmentData = attachment.data.data;
      if (!attachmentData) {
        throw new Error('Attachment data not found');
      }

      const decodedBuffer = decodeBase64Data(attachmentData);

      if (saveToDisk) {
        const validatedPath = this.validateSavePath(saveToDisk);
        fs.writeFileSync(validatedPath, decodedBuffer);
        return [{
          type: 'text',
          text: `Attachment saved to ${validatedPath}`
        }];
      } else {
        return [{
          type: 'text',
          text: decodedBuffer.toString('utf-8')
        }];
      }
    } catch (error) {
      console.error('Error getting attachment:', error);
      throw error;
    }
  }

  private async bulkSaveAttachments(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const attachments = args.attachments;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!attachments || attachments.length === 0) {
      throw new Error('Missing required argument: attachments');
    }

    try {
      const results = await Promise.all(
        attachments.map(async (attachmentInfo: any) => {
          const messageId = attachmentInfo.message_id;
          const attachmentId = attachmentInfo.attachment_id;
          const savePath = attachmentInfo.save_path;

          if (!messageId || !attachmentId || !savePath) {
            throw new Error('Missing required arguments: message_id, attachment_id, or save_path');
          }

          const attachmentData = await this.gmail.users.messages.attachments.get({
            userId,
            messageId,
            id: attachmentId
          });

          const fileData = attachmentData.data.data;
          if (!fileData) {
            throw new Error('Attachment data not found');
          }

          const decodedBuffer = decodeBase64Data(fileData);

          const validatedPath = this.validateSavePath(savePath);
          fs.writeFileSync(validatedPath, decodedBuffer);

          return {
            messageId,
            attachmentId,
            savePath,
            status: 'success'
          };
        })
      );

      return [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }];
    } catch (error) {
      console.error('Error saving attachments:', error);
      throw error;
    }
  }

  private async archive(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const messageId = args.message_id;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!messageId) {
      throw new Error('Missing required argument: message_id');
    }

    try {
      await this.gmail.users.messages.modify({
        userId,
        id: messageId,
        requestBody: {
          removeLabelIds: ['INBOX']
        }
      });

      return [{
        type: 'text',
        text: `Message ${messageId} archived successfully`
      }];
    } catch (error) {
      console.error('Error archiving message:', error);
      throw error;
    }
  }

  private async bulkArchive(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const messageIds = args.message_ids;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!messageIds || messageIds.length === 0) {
      throw new Error('Missing required argument: message_ids');
    }

    try {
      // Archive = remove the INBOX label. Use batchModify so the whole set is
      // handled in a single request per 1000 ids (no per-message concurrency).
      const CHUNK_SIZE = 1000;
      const batchSizes: number[] = [];
      for (let i = 0; i < messageIds.length; i += CHUNK_SIZE) {
        const ids = messageIds.slice(i, i + CHUNK_SIZE);
        await this.gmail.users.messages.batchModify({
          userId,
          requestBody: { ids, removeLabelIds: ['INBOX'] }
        });
        batchSizes.push(ids.length);
      }

      return [{
        type: 'text',
        text: JSON.stringify({
          status: 'archived',
          archived: messageIds.length,
          requests: batchSizes.length,
          batchSizes
        }, null, 2)
      }];
    } catch (error) {
      console.error('Error archiving messages:', error);
      throw error;
    }
  }

  private async listLabels(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }

    try {
      const response = await this.gmail.users.labels.list({ userId });
      const labels = (response.data.labels || []).map(label => ({
        id: label.id,
        name: label.name,
        type: label.type
      }));

      return [{
        type: 'text',
        text: JSON.stringify(labels, null, 2)
      }];
    } catch (error) {
      console.error('Error listing labels:', error);
      throw error;
    }
  }

  private async bulkModify(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const messageIds: string[] = args.message_ids;
    const addLabelIds: string[] = args.add_labels || [];
    const removeLabelIds: string[] = args.remove_labels || [];

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!messageIds || messageIds.length === 0) {
      throw new Error('Missing required argument: message_ids');
    }
    if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
      throw new Error('Provide at least one of add_labels or remove_labels');
    }

    try {
      // Gmail's batchModify accepts up to 1000 ids per request; split larger lists.
      const CHUNK_SIZE = 1000;
      const batchSizes: number[] = [];
      for (let i = 0; i < messageIds.length; i += CHUNK_SIZE) {
        const ids = messageIds.slice(i, i + CHUNK_SIZE);
        await this.gmail.users.messages.batchModify({
          userId,
          requestBody: { ids, addLabelIds, removeLabelIds }
        });
        batchSizes.push(ids.length);
      }

      return [{
        type: 'text',
        text: JSON.stringify({
          status: 'success',
          modified: messageIds.length,
          requests: batchSizes.length,
          batchSizes,
          addLabelIds,
          removeLabelIds
        }, null, 2)
      }];
    } catch (error) {
      console.error('Error modifying messages:', error);
      throw error;
    }
  }
}
