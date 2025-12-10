import { Tool, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { GAuthService } from '../services/gauth.js';
import { USER_ID_ARG } from '../types/tool-handler.js';

export class SheetsTools {
  private sheets: ReturnType<typeof google.sheets>;

  constructor(private gauth: GAuthService) {
    this.sheets = google.sheets({ version: 'v4', auth: this.gauth.getClient() });
  }

  getTools(): Tool[] {
    return [
      {
        name: 'sheets_get_values',
        description: 'Reads values from a Google Sheet range (read-only).',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            spreadsheet_id: {
              type: 'string',
              description: 'The ID of the Google Sheet'
            },
            range: {
              type: 'string',
              description: 'Range to read (e.g., Sheet1!A1:D20)'
            },
            major_dimension: {
              type: 'string',
              description: 'Optional major dimension (ROWS or COLUMNS)',
              enum: ['ROWS', 'COLUMNS']
            }
          },
          required: ['spreadsheet_id', 'range', USER_ID_ARG]
        }
      },
      {
        name: 'sheets_batch_get_values',
        description: 'Reads multiple ranges from a Google Sheet in one call.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            spreadsheet_id: {
              type: 'string',
              description: 'The ID of the Google Sheet'
            },
            ranges: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of ranges to read (e.g., ["Sheet1!A1:C5", "Sheet2!A1:B3"])'
            }
          },
          required: ['spreadsheet_id', 'ranges', USER_ID_ARG]
        }
      }
    ];
  }

  async handleTool(name: string, args: Record<string, any>): Promise<Array<TextContent>> {
    switch (name) {
      case 'sheets_get_values':
        return this.getValues(args);
      case 'sheets_batch_get_values':
        return this.batchGetValues(args);
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

  private async getValues(args: Record<string, any>): Promise<Array<TextContent>> {
    this.ensureUserId(args);
    const spreadsheetId = args.spreadsheet_id;
    const range = args.range;

    if (!spreadsheetId || !range) {
      throw new Error('Missing required arguments: spreadsheet_id or range');
    }

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: args.major_dimension
    });

    return [{
      type: 'text',
      text: JSON.stringify(response.data, null, 2)
    }];
  }

  private async batchGetValues(args: Record<string, any>): Promise<Array<TextContent>> {
    this.ensureUserId(args);
    const spreadsheetId = args.spreadsheet_id;
    const ranges = args.ranges;

    if (!spreadsheetId || !ranges || ranges.length === 0) {
      throw new Error('Missing required arguments: spreadsheet_id or ranges');
    }

    const response = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges
    });

    return [{
      type: 'text',
      text: JSON.stringify(response.data, null, 2)
    }];
  }
}

