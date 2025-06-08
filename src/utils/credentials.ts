import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface FigmaCredentials {
  apiKey?: string;
  oauthToken?: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), '.figma');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials');

export async function saveCredentials(credentials: FigmaCredentials): Promise<void> {
  try {
    await fs.ensureDir(CREDENTIALS_DIR);
    await fs.writeJson(CREDENTIALS_FILE, credentials, { spaces: 2 });
    await fs.chmod(CREDENTIALS_FILE, 0o600); // Read/write for owner only
  } catch (error) {
    throw new Error(`Failed to save credentials: ${error}`);
  }
}

export async function loadCredentials(): Promise<FigmaCredentials | null> {
  try {
    if (await fs.pathExists(CREDENTIALS_FILE)) {
      return await fs.readJson(CREDENTIALS_FILE);
    }
    return null;
  } catch (error) {
    throw new Error(`Failed to load credentials: ${error}`);
  }
}

export async function removeCredentials(): Promise<void> {
  try {
    if (await fs.pathExists(CREDENTIALS_FILE)) {
      await fs.remove(CREDENTIALS_FILE);
    }
  } catch (error) {
    throw new Error(`Failed to remove credentials: ${error}`);
  }
}

export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}