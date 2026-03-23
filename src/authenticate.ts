#!/usr/bin/env node

import { GAuthService } from './services/gauth.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import open from 'open';
import { parseArgs } from 'util';

const config = {
  gauthFile: './.gauth.json',
  accountsFile: './.accounts.json',
  credentialsDir: '.'
};

const gauth = new GAuthService(config);

async function authenticateAccount(email: string, force: boolean = false): Promise<void> {
  console.log(`\nAuthenticating ${email}...`);

  const existing = await gauth.getStoredCredentials(email);
  if (existing && !force) {
    console.log(`Already authenticated: ${email}`);
    return;
  }

  if (existing && force) {
    console.log(`Forcing re-authentication for ${email}...`);
  }

  const authUrl = await gauth.getAuthorizationUrl(email, {});
  console.log(`Opening browser for ${email}...`);
  console.log(`Auth URL: ${authUrl}`);

  await open(authUrl);

  return new Promise<void>((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '', 'http://localhost:4100');

      if (url.pathname === '/code') {
        const code = url.searchParams.get('code');

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can close this tab.</p>');

          try {
            await gauth.getCredentials(code, {});
            console.log(`Authenticated: ${email}`);
            server.close();
            resolve();
          } catch (error) {
            console.error(`Authentication failed for ${email}:`, (error as Error).message);
            server.close();
            reject(error);
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing authorization code');
          server.close();
          reject(new Error('Missing authorization code'));
        }
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 4100 is already in use. Stop the MCP server first.'));
      } else {
        reject(err);
      }
    });

    server.listen(4100, () => {
      console.log('Waiting for OAuth callback on http://localhost:4100/code ...');
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 5 minutes'));
    }, 300000);
  });
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const email = positionals[0] || '';

  await gauth.initialize();

  let accounts = await gauth.getAccountInfo();
  if (email) {
    accounts = accounts.filter((account) => account.email === email);
    if (accounts.length === 0) {
      console.error(`Account ${email} is not configured in .accounts.json`);
      process.exit(1);
    }
  }
  console.log(`Found ${accounts.length} configured account(s)`);

  for (const account of accounts) {
    try {
      await authenticateAccount(account.email, values.force as boolean);
    } catch (error) {
      console.error(`Failed to authenticate ${account.email}:`, (error as Error).message);
    }
  }

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
