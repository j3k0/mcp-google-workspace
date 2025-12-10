import { Tool, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { GAuthService } from '../services/gauth.js';
import { USER_ID_ARG } from '../types/tool-handler.js';

export class DocsTools {
  private docs: ReturnType<typeof google.docs>;

  constructor(private gauth: GAuthService) {
    this.docs = google.docs({ version: 'v1', auth: this.gauth.getClient() });
  }

  getTools(): Tool[] {
    return [
      {
        name: 'docs_get_document',
        description: 'Retrieves a Google Docs document and returns its text content.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            document_id: {
              type: 'string',
              description: 'The ID of the Google Docs document'
            }
          },
          required: ['document_id', USER_ID_ARG]
        }
      }
    ];
  }

  async handleTool(name: string, args: Record<string, any>): Promise<Array<TextContent>> {
    switch (name) {
      case 'docs_get_document':
        return this.getDocument(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private ensureUserId(args: Record<string, any>): string {
    const userId = args[USER_ID_ARG];
    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    return userId;
  }

  private extractText(content: any[] = []): string {
    const lines: string[] = [];

    for (const element of content) {
      if (element.paragraph?.elements) {
        const textRuns = element.paragraph.elements
          .map((el: any) => el.textRun?.content || '')
          .join('');

        const cleaned = textRuns.trimEnd();
        if (cleaned) {
          lines.push(cleaned);
        }
      }
    }

    return lines.join('\n');
  }

  private async getDocument(args: Record<string, any>): Promise<Array<TextContent>> {
    this.ensureUserId(args);
    const documentId = args.document_id;
    if (!documentId) {
      throw new Error('Missing required argument: document_id');
    }

    const response = await this.docs.documents.get({ documentId });
    const doc = response.data;
    const text = this.extractText(doc.body?.content || []);

    return [{
      type: 'text',
      text: JSON.stringify({
        documentId,
        title: doc.title,
        text
      }, null, 2)
    }];
  }
}

