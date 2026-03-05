import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REDIRECT_URI = 'http://localhost:4100/code';
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar'
];

export interface AccountInfo {
  email: string;
  accountType: string;
  extraInfo?: string;

  toDescription(): string;
}

interface ServerConfig {
  gauthFile: string;
  accountsFile: string;
  credentialsDir: string;
}

class AccountInfoImpl implements AccountInfo {
  constructor(
    public email: string,
    public accountType: string,
    public extraInfo: string = ''
  ) {}

  toDescription(): string {
    return `Account for email: ${this.email} of type: ${this.accountType}. Extra info for: ${this.extraInfo}`;
  }
}

export class GetCredentialsError extends Error {
  constructor(public authorizationUrl: string) {
    super('Error getting credentials');
  }
}

export class CodeExchangeError extends GetCredentialsError {}
export class NoRefreshTokenError extends GetCredentialsError {}
export class NoUserIdError extends Error {}

export class GAuthService {
  private oauth2Client?: OAuth2Client;
  private clientCache: Map<string, OAuth2Client> = new Map();
  private clientId?: string;
  private clientSecret?: string;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  getConfig(): ServerConfig {
    return this.config;
  }

  async initialize(): Promise<void> {
    try {
      const gauthPath = path.resolve(process.cwd(), this.config.gauthFile);
      const gauthData = await fs.readFile(gauthPath, 'utf8');
      const credentials = JSON.parse(gauthData);

      if (!credentials.installed) {
        throw new Error('Invalid OAuth2 credentials format in gauth file');
      }

      this.clientId = credentials.installed.client_id;
      this.clientSecret = credentials.installed.client_secret;
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        REDIRECT_URI
      );
    } catch (error) {
      throw new Error(`Failed to initialize OAuth2 client: ${(error as Error).message}`);
    }
  }

  getClient(): OAuth2Client {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not initialized. Call initialize() first.');
    }
    return this.oauth2Client;
  }

  getClientForUser(userId: string): OAuth2Client {
    const client = this.clientCache.get(userId);
    if (client) {
      return client;
    }
    return this.getClient();
  }

  private createClientForUser(credentials: Credentials): OAuth2Client {
    const client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      REDIRECT_URI
    );
    client.setCredentials(credentials);
    return client;
  }

  private getCredentialFilename(userId: string): string {
    return path.join(this.config.credentialsDir, `.oauth2.${userId}.json`);
  }

  async getAccountInfo(): Promise<AccountInfo[]> {
    try {
      const accountsPath = path.resolve(process.cwd(), this.config.accountsFile);
      const data = await fs.readFile(accountsPath, 'utf8');
      const { accounts } = JSON.parse(data);

      if (!Array.isArray(accounts)) {
        throw new Error('Invalid accounts format in accounts file');
      }

      return accounts.map((acc: any) => new AccountInfoImpl(
        acc.email,
        acc.account_type,
        acc.extra_info
      ));
    } catch (error) {
      console.error('Error reading accounts file:', error);
      return [];
    }
  }

  async getStoredCredentials(userId: string): Promise<OAuth2Client | null> {
    if (!this.oauth2Client) {
      return null;
    }

    // Return cached client if available
    const cached = this.clientCache.get(userId);
    if (cached) {
      return cached;
    }

    try {
      const credFilePath = this.getCredentialFilename(userId);
      const data = await fs.readFile(credFilePath, 'utf8');
      const credentials = JSON.parse(data);

      // Create a dedicated client per account to avoid race conditions
      const client = this.createClientForUser(credentials);
      this.clientCache.set(userId, client);
      return client;
    } catch (error) {
      console.warn(`No stored OAuth2 credentials yet for user: ${userId}`);
      return null;
    }
  }

  async storeCredentials(client: OAuth2Client, userId: string): Promise<void> {
    const credFilePath = this.getCredentialFilename(userId);
    await fs.mkdir(path.dirname(credFilePath), { recursive: true });
    await fs.writeFile(credFilePath, JSON.stringify(client.credentials, null, 2));
  }

  async exchangeCode(authorizationCode: string): Promise<OAuth2Client> {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not initialized. Call initialize() first.');
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(authorizationCode);
      this.oauth2Client.setCredentials(tokens);
      return this.oauth2Client;
    } catch (error) {
      console.error('Error exchanging code:', error);
      throw new CodeExchangeError('');
    }
  }

  async getUserInfo(client: OAuth2Client): Promise<any> {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    try {
      const { data } = await oauth2.userinfo.get();
      if (data && data.id) {
        return data;
      }
      throw new NoUserIdError();
    } catch (error) {
      console.error('Error getting user info:', error);
      throw error;
    }
  }

  async getAuthorizationUrl(emailAddress: string, state: any): Promise<string> {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not initialized. Call initialize() first.');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: JSON.stringify(state),
      prompt: 'consent',
      login_hint: emailAddress
    });
  }

  async getCredentials(authorizationCode: string, state: any): Promise<OAuth2Client> {
    let emailAddress = '';
    try {
      const credentials = await this.exchangeCode(authorizationCode);
      const userInfo = await this.getUserInfo(credentials);
      emailAddress = userInfo.email;

      if (credentials.credentials.refresh_token) {
        await this.storeCredentials(credentials, emailAddress);
        // Cache the per-account client
        const client = this.createClientForUser(credentials.credentials);
        this.clientCache.set(emailAddress, client);
        return credentials;
      } else {
        const storedCredentials = await this.getStoredCredentials(emailAddress);
        if (storedCredentials?.credentials.refresh_token) {
          return storedCredentials;
        }
      }
    } catch (error) {
      if (error instanceof CodeExchangeError) {
        console.error('An error occurred during code exchange.');
        error.authorizationUrl = await this.getAuthorizationUrl(emailAddress, state);
        throw error;
      }
      if (error instanceof NoUserIdError) {
        console.error('No user ID could be retrieved.');
      }
      const authorizationUrl = await this.getAuthorizationUrl(emailAddress, state);
      throw new NoRefreshTokenError(authorizationUrl);
    }

    const authorizationUrl = await this.getAuthorizationUrl(emailAddress, state);
    throw new NoRefreshTokenError(authorizationUrl);
  }
}
