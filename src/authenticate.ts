#!/usr/bin/env node

import { GAuthService } from './services/gauth.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import open from 'open';

const USAGE = `
Usage: mcp-gmail-authenticate [options] [email]

Authenticate Google accounts for the MCP Google Workspace server.

Arguments:
  email                  Authenticate a specific account only

Options:
  --force                Force re-authentication (e.g. after scope changes)
  --gauth-file <path>    Path to OAuth2 credentials file (default: ./.gauth.json)
  --accounts-file <path> Path to accounts config file (default: ./.accounts.json)
  --credentials-dir <dir> Directory to store credentials (default: .)
  --help                 Show this help message
`.trim();

function printUsage(): void {
  console.log(USAGE);
}

async function authenticateAccount(gauth: GAuthService, email: string, force: boolean = false): Promise<boolean> {
  console.log(`\nAuthenticating ${email}...`);

  const existing = await gauth.getStoredCredentials(email);
  if (existing && !force) {
    console.log(`Already authenticated: ${email}`);
    return true;
  }

  if (existing && force) {
    console.log(`Forcing re-authentication for ${email}...`);
  }

  // Generate CSRF state token
  const stateNonce = randomUUID();
  const state = { state: stateNonce };

  const authUrl = await gauth.getAuthorizationUrl(email, state);
  console.log(`Opening browser for ${email}...`);

  try {
    await open(authUrl);
  } catch {
    console.log('Could not open browser automatically. Visit this URL manually:');
    console.log(authUrl);
  }

  return new Promise<boolean>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeout);
      server.close();
    };

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '', 'http://localhost:4100');

      if (url.pathname !== '/code') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      // Verify CSRF state
      if (returnedState !== JSON.stringify(state)) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1><p>Invalid state parameter. Please try again.</p>');
        cleanup();
        reject(new Error('CSRF state mismatch'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1><p>Missing authorization code.</p>');
        cleanup();
        reject(new Error('Missing authorization code'));
        return;
      }

      try {
        const client = await gauth.getCredentials(code, state);

        // Verify the authenticated email matches the requested one
        const userInfo = await gauth.getUserInfo(client);
        if (userInfo.email !== email) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<h1>Warning</h1><p>Authenticated as ${userInfo.email} instead of ${email}. Credentials saved for ${userInfo.email}.</p>`);
          console.warn(`Warning: authenticated as ${userInfo.email} instead of ${email}`);
          console.log(`Credentials saved for ${userInfo.email} to ${gauth.getConfig().credentialsDir}/.oauth2.${userInfo.email}.json`);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can close this tab.</p>');
          console.log(`Authenticated: ${email}`);
          console.log(`Credentials saved to ${gauth.getConfig().credentialsDir}/.oauth2.${email}.json`);
        }
        cleanup();
        resolve(true);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1><p>Could not complete the OAuth flow. Check the terminal for details.</p>');
        console.error(`Authentication failed for ${email}:`, (error as Error).message);
        cleanup();
        reject(error);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 4100 is already in use. Stop the MCP server first.'));
      } else {
        reject(err);
      }
    });

    server.listen(4100, '127.0.0.1', () => {
      console.log('Waiting for OAuth callback on http://localhost:4100/code ...');
    });

    timeout = setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 5 minutes'));
    }, 300000);
  });
}

async function main(): Promise<void> {
  let values: { [key: string]: string | boolean | undefined };
  let positionals: string[];

  try {
    const parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        help: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        'gauth-file': { type: 'string', default: './.gauth.json' },
        'accounts-file': { type: 'string', default: './.accounts.json' },
        'credentials-dir': { type: 'string', default: '.' },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    console.error((error as Error).message);
    printUsage();
    process.exit(1);
  }

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const config = {
    gauthFile: values['gauth-file'] as string,
    accountsFile: values['accounts-file'] as string,
    credentialsDir: values['credentials-dir'] as string,
  };

  const gauth = new GAuthService(config);
  const email = positionals[0] || '';

  try {
    await gauth.initialize();
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes('ENOENT')) {
      console.error(`Error: ${config.gauthFile} not found.`);
      console.error('Create it with your Google OAuth2 credentials. See the README for details.');
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exit(1);
  }

  let accounts = await gauth.getAccountInfo();
  if (accounts.length === 0) {
    console.error(`Error: No accounts configured in ${config.accountsFile}.`);
    console.error('Create it with your account list. See the README for details.');
    process.exit(1);
  }

  if (email) {
    accounts = accounts.filter((account) => account.email === email);
    if (accounts.length === 0) {
      console.error(`Account ${email} is not configured in ${config.accountsFile}`);
      process.exit(1);
    }
  }

  console.log(`Found ${accounts.length} configured account(s)`);

  let succeeded = 0;
  for (const account of accounts) {
    try {
      const ok = await authenticateAccount(gauth, account.email, values.force as boolean);
      if (ok) succeeded++;
    } catch (error) {
      console.error(`Failed to authenticate ${account.email}:`, (error as Error).message);
    }
  }

  const total = accounts.length;
  if (succeeded < total) {
    console.log(`\n${succeeded} of ${total} account(s) authenticated.`);
    process.exit(1);
  }
  console.log(`\nAll ${total} account(s) authenticated.`);
}

main().catch(error => {
  console.error('Fatal error:', error.message || error);
  process.exit(1);
});
