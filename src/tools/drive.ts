import { Tool, TextContent, EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { GAuthService } from '../services/gauth.js';
import { USER_ID_ARG } from '../types/tool-handler.js';

const DEFAULT_EXPORT_MIME = 'text/plain';

export class DriveTools {
  private drive: ReturnType<typeof google.drive>;

  constructor(private gauth: GAuthService) {
    this.drive = google.drive({ version: 'v3', auth: this.gauth.getClient() });
  }

  getTools(): Tool[] {
    return [
      {
        name: 'drive_list_files',
        description: 'Lists files in Google Drive with optional query and mimeType filters.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            query: {
              type: 'string',
              description: 'Drive query string (e.g., "mimeType contains \'application/vnd.google-apps\'")'
            },
            page_size: {
              type: 'integer',
              description: 'Number of files to return (1-100)',
              minimum: 1,
              maximum: 100,
              default: 50
            }
          },
          required: [USER_ID_ARG]
        }
      },
      {
        name: 'drive_get_file_metadata',
        description: 'Retrieves metadata for a Drive file by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            file_id: {
              type: 'string',
              description: 'The ID of the Drive file'
            }
          },
          required: ['file_id', USER_ID_ARG]
        }
      },
      {
        name: 'drive_export_file',
        description: 'Exports a Google Docs/Sheets/Slides file to the specified mime type (defaults to text/plain).',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            file_id: {
              type: 'string',
              description: 'The ID of the Drive file'
            },
            export_mime_type: {
              type: 'string',
              description: 'Target mime type to export (e.g., text/plain, text/csv, application/pdf)',
              default: DEFAULT_EXPORT_MIME
            }
          },
          required: ['file_id', USER_ID_ARG]
        }
      },
      {
        name: 'drive_download_file',
        description: 'Downloads a non-Google-native Drive file by ID and returns it as an embedded resource.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            file_id: {
              type: 'string',
              description: 'The ID of the Drive file'
            },
            filename: {
              type: 'string',
              description: 'Optional filename hint for the resource'
            },
            mime_type: {
              type: 'string',
              description: 'Optional mime type hint for the resource'
            }
          },
          required: ['file_id', USER_ID_ARG]
        }
      }
    ];
  }

  async handleTool(name: string, args: Record<string, any>): Promise<Array<TextContent | EmbeddedResource>> {
    switch (name) {
      case 'drive_list_files':
        return this.listFiles(args);
      case 'drive_get_file_metadata':
        return this.getFileMetadata(args);
      case 'drive_export_file':
        return this.exportFile(args);
      case 'drive_download_file':
        return this.downloadFile(args);
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

  private async listFiles(args: Record<string, any>): Promise<Array<TextContent>> {
    this.ensureUserId(args);
    const pageSize = Math.min(Math.max(1, args.page_size || 50), 100);

    const response = await this.drive.files.list({
      q: args.query,
      pageSize,
      fields: 'files(id, name, mimeType, modifiedTime, owners(displayName, emailAddress))'
    });

    return [{
      type: 'text',
      text: JSON.stringify(response.data.files || [], null, 2)
    }];
  }

  private async getFileMetadata(args: Record<string, any>): Promise<Array<TextContent>> {
    this.ensureUserId(args);
    const fileId = args.file_id;
    if (!fileId) {
      throw new Error('Missing required argument: file_id');
    }

    const response = await this.drive.files.get({
      fileId,
      fields: 'id, name, mimeType, modifiedTime, size, webViewLink, owners(displayName, emailAddress)'
    });

    return [{
      type: 'text',
      text: JSON.stringify(response.data, null, 2)
    }];
  }

  private async exportFile(args: Record<string, any>): Promise<Array<TextContent>> {
    this.ensureUserId(args);
    const fileId = args.file_id;
    const exportMimeType = args.export_mime_type || DEFAULT_EXPORT_MIME;

    if (!fileId) {
      throw new Error('Missing required argument: file_id');
    }

    const response = await this.drive.files.export(
      { fileId, mimeType: exportMimeType },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const text = buffer.toString('utf-8');

    return [{
      type: 'text',
      text
    }];
  }

  private async downloadFile(args: Record<string, any>): Promise<Array<EmbeddedResource>> {
    this.ensureUserId(args);
    const fileId = args.file_id;
    if (!fileId) {
      throw new Error('Missing required argument: file_id');
    }

    const metadata = await this.drive.files.get({
      fileId,
      fields: 'id, name, mimeType'
    });

    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const mimeType = args.mime_type || metadata.data.mimeType || 'application/octet-stream';

    return [{
      type: 'resource',
      resource: {
        uri: `urn:drive:${fileId}`,
        mimeType,
        blob: buffer.toString('base64')
      }
    }];
  }
}

