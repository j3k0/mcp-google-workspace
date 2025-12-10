import { Tool, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { GAuthService } from '../services/gauth.js';
import { USER_ID_ARG } from '../types/tool-handler.js';

export class SlidesTools {
  private slides: ReturnType<typeof google.slides>;

  constructor(private gauth: GAuthService) {
    this.slides = google.slides({ version: 'v1', auth: this.gauth.getClient() });
  }

  getTools(): Tool[] {
    return [
      {
        name: 'slides_get_presentation',
        description: 'Retrieves a Google Slides presentation and returns slide text content.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            presentation_id: {
              type: 'string',
              description: 'The ID of the Google Slides presentation'
            }
          },
          required: ['presentation_id', USER_ID_ARG]
        }
      }
    ];
  }

  async handleTool(name: string, args: Record<string, any>): Promise<Array<TextContent>> {
    switch (name) {
      case 'slides_get_presentation':
        return this.getPresentation(args);
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

  private extractSlideText(slide: any): string {
    const chunks: string[] = [];

    if (!slide.pageElements) {
      return '';
    }

    for (const element of slide.pageElements) {
      if (element.shape?.text?.textElements) {
        const text = element.shape.text.textElements
          .map((t: any) => t.textRun?.content || '')
          .join('')
          .trim();
        if (text) {
          chunks.push(text);
        }
      }
    }

    return chunks.join('\n');
  }

  private async getPresentation(args: Record<string, any>): Promise<Array<TextContent>> {
    this.ensureUserId(args);
    const presentationId = args.presentation_id;
    if (!presentationId) {
      throw new Error('Missing required argument: presentation_id');
    }

    const response = await this.slides.presentations.get({ presentationId });
    const presentation = response.data;
    const slides = presentation.slides || [];

    const slideSummaries = slides.map((slide, idx) => ({
      slideIndex: idx + 1,
      slideObjectId: slide.objectId,
      text: this.extractSlideText(slide)
    }));

    return [{
      type: 'text',
      text: JSON.stringify({
        presentationId,
        title: presentation.title,
        slides: slideSummaries
      }, null, 2)
    }];
  }
}

