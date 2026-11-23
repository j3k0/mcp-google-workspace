/**
 * Integration tests for the calendar_update_event tool.
 *
 * Credentials are loaded from (in order of priority):
 *   1. Project root directory (per README: .gauth.json, .accounts.json)
 *   2. test_settings.json file in project root (custom test configuration)
 *   3. Claude Code settings (~/.claude/settings.json, parses gworkspace MCP config)
 *
 * User email is auto-detected from:
 *   1. TEST_USER_EMAIL environment variable
 *   2. test_settings.json user_email field
 *   3. Existing .oauth2.<email>.json token file in credentials directory
 *
 * All test data uses mock values (example.com emails per RFC 2606).
 * A temporary test event is created and deleted after tests complete.
 *
 * Usage:
 *   node test-calendar-update-event.js
 *   TEST_USER_EMAIL=you@example.com node test-calendar-update-event.js
 *
 * test_settings.json format:
 *   {
 *     "credentials_dir": "/path/to/credentials",
 *     "gauth_file": "/path/to/.gauth.json",
 *     "user_email": "you@example.com"
 *   }
 */

import { google } from 'googleapis';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Expand ~ to home directory in paths
function expandPath(p) {
  if (p && p.startsWith('~')) {
    return join(homedir(), p.slice(1));
  }
  return p;
}

// Load test settings from test_settings.json if it exists
function loadTestSettings() {
  const testSettingsPath = join(__dirname, 'test_settings.json');
  if (existsSync(testSettingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(testSettingsPath, 'utf8'));
      // Expand ~ in paths
      if (settings.credentials_dir) {
        settings.credentials_dir = expandPath(settings.credentials_dir);
      }
      if (settings.gauth_file) {
        settings.gauth_file = expandPath(settings.gauth_file);
      }
      return settings;
    } catch (e) {
      console.warn(`Warning: Could not parse test_settings.json: ${e.message}`);
    }
  }
  return null;
}

// Parse Claude Code settings to extract gworkspace MCP configuration
function parseClaudeCodeSettings() {
  const claudeSettingsPath = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(claudeSettingsPath)) {
    return null;
  }

  try {
    const settings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'));
    const gworkspace = settings.mcpServers?.gworkspace;

    if (!gworkspace?.args) {
      return null;
    }

    const args = gworkspace.args;
    const config = {};

    // Parse command-line style arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--gauth-file' && args[i + 1]) {
        config.gauth_file = args[i + 1];
      } else if (args[i] === '--accounts-file' && args[i + 1]) {
        config.accounts_file = args[i + 1];
      } else if (args[i] === '--credentials-dir' && args[i + 1]) {
        config.credentials_dir = args[i + 1];
      }
    }

    return Object.keys(config).length > 0 ? config : null;
  } catch (e) {
    console.warn(`Warning: Could not parse Claude Code settings: ${e.message}`);
    return null;
  }
}

// Determine credentials configuration
function getCredentialsConfig() {
  // 1. Check project root directory (per README)
  const projectGauthPath = join(__dirname, '.gauth.json');
  if (existsSync(projectGauthPath)) {
    return {
      source: 'project root (per README)',
      credentials_dir: __dirname,
      gauth_file: projectGauthPath
    };
  }

  // 2. Check test_settings.json
  const testSettings = loadTestSettings();
  if (testSettings) {
    const gauthFile = testSettings.gauth_file || 
      (testSettings.credentials_dir ? join(testSettings.credentials_dir, '.gauth.json') : null);
    
    if (gauthFile && existsSync(gauthFile)) {
      return {
        source: 'test_settings.json',
        credentials_dir: testSettings.credentials_dir || dirname(gauthFile),
        gauth_file: gauthFile,
        user_email: testSettings.user_email
      };
    }
  }

  // 3. Parse Claude Code settings
  const claudeConfig = parseClaudeCodeSettings();
  if (claudeConfig) {
    const gauthFile = claudeConfig.gauth_file;
    if (gauthFile && existsSync(gauthFile)) {
      return {
        source: 'Claude Code settings (~/.claude/settings.json)',
        credentials_dir: claudeConfig.credentials_dir || dirname(gauthFile),
        gauth_file: gauthFile
      };
    }
  }

  throw new Error(
    'Could not find credentials. Options:\n' +
    '  1. Place .gauth.json in project root (per README)\n' +
    '  2. Create test_settings.json with credentials_dir or gauth_file\n' +
    '  3. Configure gworkspace MCP server in Claude Code'
  );
}

const CONFIG = getCredentialsConfig();
const CREDENTIALS_DIR = CONFIG.credentials_dir;
const GAUTH_PATH = CONFIG.gauth_file;
const CALENDAR_ID = 'primary';

// Auto-detect user email from OAuth token files
function detectUserEmail() {
  // 1. TEST_USER_EMAIL environment variable
  if (process.env.TEST_USER_EMAIL) {
    return process.env.TEST_USER_EMAIL;
  }

  // 2. user_email from test_settings.json (passed through CONFIG)
  if (CONFIG.user_email) {
    return CONFIG.user_email;
  }

  // 3. Find OAuth token file in credentials directory
  try {
    const files = readdirSync(CREDENTIALS_DIR);
    const tokenFile = files.find(f => f.startsWith('.oauth2.') && f.endsWith('.json'));
    if (tokenFile) {
      const email = tokenFile.replace('.oauth2.', '').replace('.json', '');
      return email;
    }
  } catch (e) {
    // Ignore
  }

  throw new Error(
    `Could not detect user email. Options:\n` +
    `  1. Set TEST_USER_EMAIL environment variable\n` +
    `  2. Add user_email to test_settings.json\n` +
    `  3. Ensure an .oauth2.<email>.json token file exists in ${CREDENTIALS_DIR}`
  );
}

const USER_EMAIL = detectUserEmail();
const TOKEN_PATH = join(CREDENTIALS_DIR, `.oauth2.${USER_EMAIL}.json`);

// Initialize OAuth2 client
function initializeClient() {
  const gauthData = JSON.parse(readFileSync(GAUTH_PATH, 'utf8'));
  const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));

  const { client_secret, client_id, redirect_uris } = gauthData.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(token);

  return google.calendar({ version: 'v3', auth: oAuth2Client });
}

// Simulates the updateCalendarEvent method from CalendarTools
async function updateCalendarEvent(calendar, args) {
  const userId = args.user_id;
  const eventId = args.event_id;

  if (!userId) {
    throw new Error('Missing required argument: user_id');
  }
  if (!eventId) {
    throw new Error('Missing required argument: event_id');
  }

  const calendarId = args.calendar_id || 'primary';
  const timezone = args.timezone || 'UTC';

  // Fetch current event
  const currentEvent = await calendar.events.get({
    calendarId,
    eventId
  });

  // Build update object with only provided fields
  const updateData = {};

  if (args.summary !== undefined) updateData.summary = args.summary;
  if (args.location !== undefined) updateData.location = args.location;
  if (args.description !== undefined) updateData.description = args.description;

  if (args.start_time !== undefined) {
    updateData.start = {
      dateTime: args.start_time,
      timeZone: timezone
    };
  }

  if (args.end_time !== undefined) {
    updateData.end = {
      dateTime: args.end_time,
      timeZone: timezone
    };
  }

  // Handle attendees
  if (args.attendees !== undefined) {
    updateData.attendees = args.attendees.map(email => ({ email }));
  } else if (args.add_attendees !== undefined && args.add_attendees.length > 0) {
    const existingAttendees = currentEvent.data.attendees || [];
    const existingEmails = new Set(existingAttendees.map(a => a.email));
    const newAttendees = args.add_attendees
      .filter(email => !existingEmails.has(email))
      .map(email => ({ email }));
    updateData.attendees = [...existingAttendees, ...newAttendees];
  }

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: updateData,
    sendUpdates: args.send_notifications === false ? 'none' : 'all'
  });

  return response.data;
}

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`📋 ${title}`);
  console.log('='.repeat(60));
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

// Mock test data
const MOCK_DATA = {
  event: {
    summary: '[TEST] calendar_update_event - Auto-generated',
    location: 'Mock Location - Test Room',
    description: 'Auto-generated test event. Will be deleted after tests complete.'
  },
  updates: {
    summary: '[TEST] Updated Event Title',
    location: 'Mock Location - Conference Room A',
    description: 'Updated mock description with more details.',
    finalSummary: '[TEST] Multi-field Update Complete',
    finalLocation: 'Mock Location - Final Room',
    finalDescription: 'Final mock description after multi-field update.'
  }
};

// Create a test event
async function createTestEvent(calendar) {
  const now = new Date();
  const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

  const event = {
    summary: MOCK_DATA.event.summary,
    location: MOCK_DATA.event.location,
    description: MOCK_DATA.event.description,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'UTC'
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'UTC'
    }
  };

  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
    sendUpdates: 'none'
  });

  return response.data;
}

// Delete test event
async function deleteTestEvent(calendar, eventId) {
  await calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId,
    sendUpdates: 'none'
  });
}

// Test cases
async function testUpdateSummary(calendar, eventId) {
  logSection('Test 1: Update summary only');

  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    summary: MOCK_DATA.updates.summary,
    send_notifications: false
  });

  assertEqual(result.summary, MOCK_DATA.updates.summary, 'Summary should be updated');
  logSuccess(`Summary updated to: "${result.summary}"`);

  return result;
}

async function testUpdateLocation(calendar, eventId) {
  logSection('Test 2: Update location only');

  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    location: MOCK_DATA.updates.location,
    send_notifications: false
  });

  assertEqual(result.location, MOCK_DATA.updates.location, 'Location should be updated');
  logSuccess(`Location updated to: "${result.location}"`);

  return result;
}

async function testUpdateDescription(calendar, eventId) {
  logSection('Test 3: Update description only');

  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    description: MOCK_DATA.updates.description,
    send_notifications: false
  });

  assertEqual(result.description, MOCK_DATA.updates.description, 'Description should be updated');
  logSuccess(`Description updated to: "${result.description}"`);

  return result;
}

async function testUpdateTimes(calendar, eventId) {
  logSection('Test 4: Update start and end times');

  const newStart = new Date();
  newStart.setDate(newStart.getDate() + 2); // Day after tomorrow
  newStart.setHours(14, 0, 0, 0);

  const newEnd = new Date(newStart.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    start_time: newStart.toISOString(),
    end_time: newEnd.toISOString(),
    timezone: 'America/New_York',
    send_notifications: false
  });

  assert(result.start.dateTime, 'Start time should be set');
  assert(result.end.dateTime, 'End time should be set');
  logSuccess(`Times updated - Start: ${result.start.dateTime}, End: ${result.end.dateTime}`);

  return result;
}

async function testAddAttendees(calendar, eventId) {
  logSection('Test 5: Add attendees to existing list');

  // Mock attendee emails (using example.com per RFC 2606 - reserved for documentation)
  const attendeesToAdd = ['mock-attendee-1@example.com', 'mock-attendee-2@example.com'];
  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    add_attendees: attendeesToAdd,
    send_notifications: false
  });

  const attendeeEmails = (result.attendees || []).map(a => a.email);
  attendeesToAdd.forEach(email => {
    assert(attendeeEmails.includes(email), `Attendee ${email} should be added`);
  });

  logSuccess(`Attendees added: ${attendeesToAdd.join(', ')}`);
  logInfo(`Total attendees: ${result.attendees?.length || 0}`);

  return result;
}

async function testAddDuplicateAttendees(calendar, eventId) {
  logSection('Test 6: Add duplicate attendees (should not duplicate)');

  const currentEvent = await calendar.events.get({
    calendarId: CALENDAR_ID,
    eventId
  });
  const currentCount = currentEvent.data.attendees?.length || 0;

  // Try to add the same mock attendee from previous test
  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    add_attendees: ['mock-attendee-1@example.com'],
    send_notifications: false
  });

  const newCount = result.attendees?.length || 0;
  assertEqual(newCount, currentCount, 'Attendee count should not increase for duplicates');

  logSuccess('Duplicate attendees correctly ignored');
  logInfo(`Attendee count unchanged: ${newCount}`);

  return result;
}

async function testReplaceAttendees(calendar, eventId) {
  logSection('Test 7: Replace entire attendee list');

  // Mock replacement attendee list
  const newAttendeeList = [
    'mock-replaced-1@example.com',
    'mock-replaced-2@example.com',
    'mock-replaced-3@example.com'
  ];
  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    attendees: newAttendeeList,
    send_notifications: false
  });

  const attendeeEmails = (result.attendees || []).map(a => a.email);
  assertEqual(attendeeEmails.length, newAttendeeList.length, 'Attendee count should match');

  newAttendeeList.forEach(email => {
    assert(attendeeEmails.includes(email), `Attendee ${email} should be in list`);
  });

  logSuccess(`Attendee list replaced with: ${newAttendeeList.join(', ')}`);

  return result;
}

async function testUpdateMultipleFields(calendar, eventId) {
  logSection('Test 8: Update multiple fields at once');

  const updates = {
    summary: MOCK_DATA.updates.finalSummary,
    location: MOCK_DATA.updates.finalLocation,
    description: MOCK_DATA.updates.finalDescription
  };

  const result = await updateCalendarEvent(calendar, {
    user_id: USER_EMAIL,
    event_id: eventId,
    ...updates,
    send_notifications: false
  });

  assertEqual(result.summary, updates.summary, 'Summary should match');
  assertEqual(result.location, updates.location, 'Location should match');
  assertEqual(result.description, updates.description, 'Description should match');

  logSuccess('Multiple fields updated successfully');

  return result;
}

async function testMissingUserId(calendar, eventId) {
  logSection('Test 9: Error handling - Missing user_id');

  try {
    await updateCalendarEvent(calendar, {
      event_id: eventId,
      summary: 'Should fail'
    });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('user_id'), 'Error should mention user_id');
    logSuccess('Correctly rejected request without user_id');
  }
}

async function testMissingEventId(calendar) {
  logSection('Test 10: Error handling - Missing event_id');

  try {
    await updateCalendarEvent(calendar, {
      user_id: USER_EMAIL,
      summary: 'Should fail'
    });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('event_id'), 'Error should mention event_id');
    logSuccess('Correctly rejected request without event_id');
  }
}

// Main test runner
async function runTests() {
  console.log('\n🧪 calendar_update_event Tool Test Suite');
  console.log('=' .repeat(60));
  console.log(`🔑 Config source: ${CONFIG.source}`);
  console.log(`📁 Credentials: ${CREDENTIALS_DIR}`);
  console.log(`📧 User: ${USER_EMAIL}`);
  console.log(`📅 Calendar: ${CALENDAR_ID}`);
  console.log('=' .repeat(60));

  let calendar;
  let testEvent;
  let passed = 0;
  let failed = 0;

  try {
    calendar = initializeClient();
    logInfo('OAuth client initialized');
  } catch (error) {
    console.error('❌ Failed to initialize OAuth client:', error.message);
    console.error('   Make sure .gauth.json and OAuth token files exist.');
    process.exit(1);
  }

  try {
    logSection('Setup: Creating test event');
    testEvent = await createTestEvent(calendar);
    logSuccess(`Created test event: ${testEvent.id}`);
    logInfo(`Summary: ${testEvent.summary}`);
  } catch (error) {
    console.error('❌ Failed to create test event:', error.message);
    process.exit(1);
  }

  const tests = [
    () => testUpdateSummary(calendar, testEvent.id),
    () => testUpdateLocation(calendar, testEvent.id),
    () => testUpdateDescription(calendar, testEvent.id),
    () => testUpdateTimes(calendar, testEvent.id),
    () => testAddAttendees(calendar, testEvent.id),
    () => testAddDuplicateAttendees(calendar, testEvent.id),
    () => testReplaceAttendees(calendar, testEvent.id),
    () => testUpdateMultipleFields(calendar, testEvent.id),
    () => testMissingUserId(calendar, testEvent.id),
    () => testMissingEventId(calendar)
  ];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      failed++;
      console.error(`❌ Test failed: ${error.message}`);
      if (error.response) {
        console.error('   API Response:', error.response.data);
      }
    }
  }

  // Cleanup
  logSection('Cleanup: Deleting test event');
  try {
    await deleteTestEvent(calendar, testEvent.id);
    logSuccess('Test event deleted');
  } catch (error) {
    console.error(`⚠️  Failed to delete test event: ${error.message}`);
  }

  // Summary
  logSection('Test Summary');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('\n🎉 All tests passed!\n');
}

runTests().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
