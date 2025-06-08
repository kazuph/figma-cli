import inquirer from 'inquirer';
import { saveCredentials, loadCredentials, removeCredentials, getCredentialsPath } from '../utils/credentials.js';

export interface AuthOptions {
  remove?: boolean;
  show?: boolean;
}

export async function authCommand(options: AuthOptions = {}): Promise<void> {
  if (options.remove) {
    await handleRemoveCredentials();
    return;
  }

  if (options.show) {
    await handleShowCredentials();
    return;
  }

  await handleSetupCredentials();
}

async function handleSetupCredentials(): Promise<void> {
  console.log('🔐 Figma Authentication Setup');
  console.log('');
  console.log('You need a Figma Personal Access Token to use this tool.');
  console.log('Get your token at: https://www.figma.com/developers/api#authentication');
  console.log('');

  const existingCredentials = await loadCredentials();
  
  if (existingCredentials?.apiKey) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Credentials already exist. Do you want to overwrite them?',
        default: false
      }
    ]);

    if (!overwrite) {
      console.log('✅ Keeping existing credentials');
      return;
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your Figma Personal Access Token:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        if (input.length < 10) {
          return 'API key seems too short';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Save these credentials?',
      default: true
    }
  ]);

  if (answers.confirm) {
    await saveCredentials({ apiKey: answers.apiKey });
    console.log('');
    console.log('✅ Credentials saved successfully!');
    console.log(`📁 Stored in: ${getCredentialsPath()}`);
  } else {
    console.log('❌ Credentials not saved');
  }
}

async function handleRemoveCredentials(): Promise<void> {
  const existingCredentials = await loadCredentials();
  
  if (!existingCredentials) {
    console.log('ℹ️  No credentials found to remove');
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to remove saved credentials?',
      default: false
    }
  ]);

  if (confirm) {
    await removeCredentials();
    console.log('✅ Credentials removed successfully');
  } else {
    console.log('❌ Credentials not removed');
  }
}

async function handleShowCredentials(): Promise<void> {
  const credentials = await loadCredentials();
  
  if (!credentials) {
    console.log('ℹ️  No credentials found');
    console.log('Run "fgm auth" to set up authentication');
    return;
  }

  console.log('🔐 Current Credentials:');
  console.log(`📁 Path: ${getCredentialsPath()}`);
  
  if (credentials.apiKey) {
    const maskedKey = credentials.apiKey.slice(0, 8) + '...';
    console.log(`🔑 API Key: ${maskedKey}`);
  }
  
  if (credentials.oauthToken) {
    const maskedToken = credentials.oauthToken.slice(0, 8) + '...';
    console.log(`🎫 OAuth Token: ${maskedToken}`);
  }
}