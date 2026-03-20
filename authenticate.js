#!/usr/bin/env node

// Standalone authentication script for Google Workspace MCP
// This script authenticates all configured accounts and stores credentials

import { GAuthService } from './dist/services/gauth.js';
import { createServer } from 'http';
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';
import open from 'open';
import * as fs from 'fs/promises';

const config = {
  gauthFile: '.gauth.json',
  accountsFile: 'accounts.json',
  credentialsDir: 'credentials'
};

const gauth = new GAuthService(config);

function parseCliArgs(argv) {
  const args = {
    email: '',
    force: false
  };

  for (const arg of argv) {
    if (arg === '--force') {
      args.force = true;
      continue;
    }

    if (arg.startsWith('--email=')) {
      args.email = arg.slice('--email='.length);
      continue;
    }

    if (!arg.startsWith('--') && !args.email) {
      args.email = arg;
    }
  }

  return args;
}

async function authenticateAccount(email, force = false) {
  console.log(`\nAuthenticating ${email}...`);

  // Check if already authenticated
  const existing = await gauth.getStoredCredentials(email);
  if (existing && !force) {
    console.log(`✓ ${email} already authenticated`);
    return;
  }

  if (existing && force) {
    console.log(`Forcing re-authentication for ${email}...`);
  }

  // Generate auth URL
  const authUrl = await gauth.getAuthorizationUrl(email, {});
  console.log(`Opening browser for ${email}...`);
  console.log(`Auth URL: ${authUrl}`);

  // Open browser
  open(authUrl);

  // Start HTTP server to receive callback
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = parseUrl(req.url || '');

      if (url.pathname === '/code') {
        const query = parseQueryString(url.query || '');

        if (query.code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can close this tab.</p>');

          try {
            await gauth.getCredentials(query.code, {});
            console.log(`✓ ${email} authenticated successfully`);
            server.close();
            resolve();
          } catch (error) {
            console.error(`✗ Authentication failed for ${email}:`, error.message);
            server.close();
            reject(error);
          }
        } else {
          res.writeHead(400);
          res.end('Missing authorization code');
          server.close();
          reject(new Error('Missing authorization code'));
        }
      }
    });

    server.listen(4100, () => {
      console.log('Waiting for OAuth callback on http://localhost:4100/code ...');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 300000);
  });
}

async function main() {
  console.log('Google Workspace MCP - Account Authentication\n');
  const args = parseCliArgs(process.argv.slice(2));

  // Initialize OAuth client
  await gauth.initialize();

  // Get all configured accounts
  let accounts = await gauth.getAccountInfo();
  if (args.email) {
    accounts = accounts.filter((account) => account.email === args.email);
    if (accounts.length === 0) {
      throw new Error(`Account ${args.email} is not configured`);
    }
  }
  console.log(`Found ${accounts.length} configured accounts\n`);

  // Authenticate each account sequentially
  for (const account of accounts) {
    try {
      await authenticateAccount(account.email, args.force);
    } catch (error) {
      console.error(`Failed to authenticate ${account.email}:`, error.message);
    }
  }

  console.log('\n✓ Authentication complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
