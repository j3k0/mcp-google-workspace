import { Tool, TextContent, ImageContent, EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';
import { GAuthService } from '../services/gauth.js';
import { google } from 'googleapis';
import { USER_ID_ARG } from '../types/tool-handler.js';

const CALENDAR_ID_ARG = 'calendar_id';

export class CalendarTools {
  private calendar: ReturnType<typeof google.calendar>;

  constructor(private gauth: GAuthService) {
    this.calendar = google.calendar({ version: 'v3', auth: this.gauth.getClient() });
  }

  getTools(): Tool[] {
    return [
      {
        name: 'calendar_list_accounts',
        description: 'Lists all configured Google accounts that can be used with the calendar tools. This tool does not require a user_id as it lists available accounts before selection.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
          required: []
        }
      },
      {
        name: 'calendar_list',
        description: `Lists all calendars accessible by the user. 
        Call it before any other tool whenever the user specifies a particular agenda (Family, Holidays, etc.).
        Returns detailed calendar metadata including access roles and timezone information.`,
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
        name: 'calendar_get_events',
        description: 'Retrieves calendar events from the user\'s Google Calendar within a specified time range.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            [CALENDAR_ID_ARG]: {
              type: 'string',
              description: 'Calendar ID to fetch events from. Use "primary" for the primary calendar.',
              default: 'primary'
            },
            time_min: {
              type: 'string',
              description: 'Start time in RFC3339 format (e.g. 2024-12-01T00:00:00Z). Defaults to current time if not specified.'
            },
            time_max: {
              type: 'string',
              description: 'End time in RFC3339 format (e.g. 2024-12-31T23:59:59Z). Optional.'
            },
            max_results: {
              type: 'integer',
              description: 'Maximum number of events to return (1-2500)',
              minimum: 1,
              maximum: 2500,
              default: 250
            },
            show_deleted: {
              type: 'boolean',
              description: 'Whether to include deleted events',
              default: false
            },
            timezone: {
              type: 'string',
              description: 'Timezone for the events (e.g. \'America/New_York\'). Defaults to UTC.',
              default: 'UTC'
            }
          },
          required: [USER_ID_ARG]
        }
      },
      {
        name: 'calendar_create_event',
        description: 'Creates a new event in the specified Google Calendar.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            [CALENDAR_ID_ARG]: {
              type: 'string',
              description: 'Calendar ID to create the event in. Use "primary" for the primary calendar.',
              default: 'primary'
            },
            summary: {
              type: 'string',
              description: 'Title of the event'
            },
            start_time: {
              type: 'string',
              description: 'Start time in RFC3339 format (e.g. 2024-12-01T10:00:00Z)'
            },
            end_time: {
              type: 'string',
              description: 'End time in RFC3339 format (e.g. 2024-12-01T11:00:00Z)'
            },
            location: {
              type: 'string',
              description: 'Location of the event (optional)'
            },
            description: {
              type: 'string',
              description: 'Description or notes for the event (optional)'
            },
            attendees: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of attendee email addresses (optional)'
            },
            send_notifications: {
              type: 'boolean',
              description: 'Whether to send notifications to attendees',
              default: true
            },
            timezone: {
              type: 'string',
              description: 'Timezone for the event (e.g. \'America/New_York\'). Defaults to UTC.',
              default: 'UTC'
            }
          },
          required: [USER_ID_ARG, 'summary', 'start_time', 'end_time']
        }
      },
      {
        name: 'calendar_delete_event',
        description: 'Deletes an event from the specified Google Calendar.',
        inputSchema: {
          type: 'object',
          properties: {
            [USER_ID_ARG]: {
              type: 'string',
              description: 'Email address of the user'
            },
            [CALENDAR_ID_ARG]: {
              type: 'string',
              description: 'Calendar ID containing the event. Use "primary" for the primary calendar.',
              default: 'primary'
            },
            event_id: {
              type: 'string',
              description: 'The ID of the calendar event to delete'
            },
            send_notifications: {
              type: 'boolean',
              description: 'Whether to send cancellation notifications to attendees',
              default: true
            }
          },
          required: [USER_ID_ARG, 'event_id']
        }
      }
    ];
  }

  async handleTool(name: string, args: Record<string, any>): Promise<Array<TextContent | ImageContent | EmbeddedResource>> {
    switch (name) {
      case 'calendar_list_accounts':
        return this.listAccounts();
      case 'calendar_list':
        return this.listCalendars(args);
      case 'calendar_get_events':
        return this.getCalendarEvents(args);
      case 'calendar_create_event':
        return this.createCalendarEvent(args);
      case 'calendar_delete_event':
        return this.deleteCalendarEvent(args);
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

  private async listCalendars(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }

    try {
      console.error('Attempting to list calendars...');
      const response = await this.calendar.calendarList.list();
      const calendars = response.data.items?.map(calendar => ({
        id: calendar.id,
        summary: calendar.summary,
        primary: calendar.primary || false,
        timeZone: calendar.timeZone,
        etag: calendar.etag,
        accessRole: calendar.accessRole
      })) || [];

      console.error(`Successfully retrieved ${calendars.length} calendars`);
      return [{
        type: 'text',
        text: JSON.stringify(calendars, null, 2)
      }];
    } catch (error) {
      console.error('Error listing calendars:', error);
      throw error;
    }
  }

  private async getCalendarEvents(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }

    try {
      const timeMin = args.time_min || new Date().toISOString();
      const maxResults = Math.min(Math.max(1, args.max_results || 250), 2500);
      const calendarId = args[CALENDAR_ID_ARG] || 'primary';
      const timezone = args.timezone || 'UTC';

      const params = {
        calendarId,
        timeMin,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime' as const,
        showDeleted: args.show_deleted || false
      };

      if (args.time_max) {
        Object.assign(params, { timeMax: args.time_max });
      }

      const response = await this.calendar.events.list(params);
      const events = response.data.items?.map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        status: event.status,
        creator: event.creator,
        organizer: event.organizer,
        attendees: event.attendees,
        location: event.location,
        hangoutLink: event.hangoutLink,
        conferenceData: event.conferenceData,
        recurringEventId: event.recurringEventId
      })) || [];

      return [{
        type: 'text',
        text: JSON.stringify(events, null, 2)
      }];
    } catch (error) {
      console.error('Error getting calendar events:', error);
      throw error;
    }
  }

  private async createCalendarEvent(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const required = ['summary', 'start_time', 'end_time'];
    
    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!required.every(key => key in args)) {
      throw new Error(`Missing required arguments: ${required.filter(key => !(key in args)).join(', ')}`);
    }

    try {
      const timezone = args.timezone || 'UTC';
      const event = {
        summary: args.summary,
        location: args.location,
        description: args.description,
        start: {
          dateTime: args.start_time,
          timeZone: timezone
        },
        end: {
          dateTime: args.end_time,
          timeZone: timezone
        },
        attendees: args.attendees?.map((email: string) => ({ email }))
      };

      const response = await this.calendar.events.insert({
        calendarId: args[CALENDAR_ID_ARG] || 'primary',
        requestBody: event,
        sendUpdates: args.send_notifications ? 'all' : 'none'
      });

      return [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }];
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  private async deleteCalendarEvent(args: Record<string, any>): Promise<Array<TextContent>> {
    const userId = args[USER_ID_ARG];
    const eventId = args.event_id;

    if (!userId) {
      throw new Error(`Missing required argument: ${USER_ID_ARG}`);
    }
    if (!eventId) {
      throw new Error('Missing required argument: event_id');
    }

    try {
      await this.calendar.events.delete({
        calendarId: args[CALENDAR_ID_ARG] || 'primary',
        eventId: eventId,
        sendUpdates: args.send_notifications ? 'all' : 'none'
      });

      return [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Event successfully deleted'
        }, null, 2)
      }];
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      return [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          message: 'Failed to delete event'
        }, null, 2)
      }];
    }
  }
}