import { Tool, TextContent, ImageContent, EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';

export interface ToolHandler {
  name: string;
  getToolDescription(): Tool;
  runTool(args: Record<string, any>): Promise<Array<TextContent | ImageContent | EmbeddedResource>>;
}

export const USER_ID_ARG = 'user_id';