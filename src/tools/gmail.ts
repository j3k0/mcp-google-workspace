import { Tool, TextContent, ImageContent, EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';
import { GAuthService } from '../services/gauth.js';
import { google } from 'googleapis';
import { USER_ID_ARG } from '../types/tool-handler.js';
import { Buffer } from 'buffer';
import fs from 'fs';

function decodeBase64Data(fileData: string): Buffer {
  const standardBase64Data = fileData.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - standardBase64Data.length % 4) % 4);
  return Buffer.from(standardBase64Data + padding, 'base64');
}

export class GmailTools {
  private gmail: ReturnType<typeof google.gmail>;

  constructor(private gauth: GAuthService) {
    this.gmail = google.gmail({ version: 'v1', auth: this.gauth.getClient() });
  }

  getTools(): Tool[] {
    return [
      {
        name: 'gmail_list_accounts',
        description: 'Lists all configured Google accounts that can be used with the Gmail tools. This tool does not require a user_id as it lists available accounts before selection.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
          required: []
        }
      },
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
              type: 'string',
              description: 'Email address of the recipient'
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
        name: 'gmail_reply',
        description: `Creates a reply to an existing Gmail email message and either sends it or saves as draft.

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
              description: 'The fullpath to save the attachment to disk. If not provided, the attachment is returned as a resource.'
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
                  part_id: {
                    type: 'string',
                    description: 'ID of the part containing the attachment'
                  },
                  save_path: {
                    type: 'string',
                    description: 'Path where the attachment should be saved'
                  }
                },
                required: ['message_id', 'part_id', 'save_path']
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
      }
    ];
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

      const result = {
        ...email.data,
        attachments
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

          const result = {
            ...email.data,
            attachments
          };

          return result;
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
    const to = args.to;
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
      const message = {
        raw: Buffer.from(
          `To: ${to}\r\n` +
          `Subject: ${subject}\r\n` +
          `Cc: ${cc.join(', ')}\r\n` +
          `Content-Type: text/plain; charset="UTF-8"\r\n` +
          `\r\n` +
          `${body}`
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
    const send = args.send || false;
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

      const message = {
        raw: Buffer.from(
          `In-Reply-To: ${originalMessageId}\r\n` +
          `References: ${originalMessageId}\r\n` +
          `Subject: Re: ${headers.subject || ''}\r\n` +
          `To: ${headers.from || ''}\r\n` +
          `Cc: ${cc.join(', ')}\r\n` +
          `Content-Type: text/plain; charset="UTF-8"\r\n` +
          `\r\n` +
          `${replyBody}`
        ).toString('base64url'),
        threadId: originalMessage.data.threadId
      };

      if (send) {
        const sent = await this.gmail.users.messages.send({
          userId,
          requestBody: message
        });
        return [{
          type: 'text',
          text: JSON.stringify(sent.data, null, 2)
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
      console.error('Error replying:', error);
      throw error;
    }
  }

  private async getAttachment(args: Record<string, any>): Promise<Array<TextContent | EmbeddedResource>> {
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

      if (!attachment.data.data) {
        throw new Error('No attachment data found');
      }

      const decodedData = decodeBase64Data(attachment.data.data);

      if (saveToDisk) {
        await fs.promises.writeFile(saveToDisk, decodedData);
        return [{
          type: 'text',
          text: `Attachment saved to disk: ${saveToDisk}`
        }];
      }

      const attachmentUrl = `attachment://gmail/${messageId}/${attachmentId}/${filename}`;
      return [{
        type: 'resource',
        resource: {
          blob: attachment.data.data,
          uri: attachmentUrl,
          mimeType
        }
      }];
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
      const savedAttachments = await Promise.all(
        attachments.map(async (attachmentInfo: Record<string, any>) => {
          const messageId = attachmentInfo.message_id;
          const partId = attachmentInfo.part_id;
          const savePath = attachmentInfo.save_path;

          const attachmentData = await this.gmail.users.messages.attachments.get({
            userId,
            messageId,
            id: partId
          });

          if (!attachmentData.data.data) {
            throw new Error(`No data found for attachment ${partId} in message ${messageId}`);
          }

          const decodedData = decodeBase64Data(attachmentData.data.data);
          await fs.promises.writeFile(savePath, decodedData);

          return {
            messageId,
            partId,
            savePath,
            size: attachmentData.data.size
          };
        })
      );

      return [{
        type: 'text',
        text: JSON.stringify(savedAttachments, null, 2)
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
      const archivedMessages = await Promise.all(
        messageIds.map(async (messageId: string) => {
          await this.gmail.users.messages.modify({
            userId,
            id: messageId,
            requestBody: {
              removeLabelIds: ['INBOX']
            }
          });
          return messageId;
        })
      );

      return [{
        type: 'text',
        text: `Messages ${archivedMessages.join(', ')} archived successfully`
      }];
    } catch (error) {
      console.error('Error archiving messages:', error);
      throw error;
    }
  }

  // Add other tool implementations here...
}