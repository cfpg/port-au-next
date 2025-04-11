import * as Minio from 'minio';
import crypto from 'crypto';
import logger from '~/services/logger';
import { App } from '~/types';
import { generateBucketName } from '~/utils/bucket';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import insertAppServiceCredentialsQuery from '~/queries/insertAppServiceCredentialsQuery';
import { execCommand } from '~/utils/docker';
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.MINIO_ROOT_USER || !process.env.MINIO_ROOT_PASSWORD || !process.env.MINIO_HOST) {
  throw new Error('Missing required Minio environment variables');
}

const rootUser = process.env.MINIO_ROOT_USER;
const rootPassword = process.env.MINIO_ROOT_PASSWORD;
const host = process.env.MINIO_HOST;

const client = new Minio.Client({
  endPoint: host,
  accessKey: rootUser,
  secretKey: rootPassword,
});

interface MinioCredentials {
  public_key: string;
  secret_key: string;
  bucket: string;
}

async function generateRandomString(length: number): Promise<string> {
  return crypto.randomBytes(length).toString('hex');
}

async function checkBucketExists(bucketName: string): Promise<boolean> {
  try {
    // Force a fresh check by listing all buckets
    const buckets = await client.listBuckets();
    const exists = buckets.some(b => b.name === bucketName);
    await logger.info(`Checked bucket existence for ${bucketName}: ${exists}`);
    return exists;
  } catch (error) {
    await logger.error(`Error checking bucket existence for ${bucketName}:`, error as Error);
    return false;
  }
}

async function createBucket(bucketName: string): Promise<boolean> {
  try {
    await logger.info(`Attempting to create bucket ${bucketName}...`);
    await client.makeBucket(bucketName);
    await logger.info(`Successfully created bucket ${bucketName}`);
    
    // Verify bucket exists with a fresh check
    const exists = await checkBucketExists(bucketName);
    if (!exists) {
      throw new Error(`Bucket ${bucketName} was not created successfully`);
    }
    await logger.info(`Verified bucket ${bucketName} exists`);
    
    return true;
  } catch (error) {
    await logger.error(`Failed to create bucket ${bucketName}:`, error as Error);
    return false;
  }
}

async function createMinioUser(accessKey: string, secretKey: string): Promise<boolean> {
  try {
    await logger.info(`Creating Minio user with access key: ${accessKey}`);
    
    // First, ensure mc is configured with admin credentials
    await execCommand(`docker compose exec minio mc alias set myminio http://minio:80 ${rootUser} ${rootPassword}`);
    
    // Create the user with the generated credentials
    await execCommand(`docker compose exec minio mc admin user add myminio ${accessKey} ${secretKey}`);
    
    await logger.info(`Successfully created Minio user: ${accessKey}`);
    return true;
  } catch (error) {
    await logger.error(`Failed to create Minio user:`, error as Error);
    return false;
  }
}

async function createAndAttachUserPolicy(appName: string, accessKey: string, bucketName: string): Promise<boolean> {
  try {
    await logger.info(`Creating and attaching policy for user ${accessKey} with bucket ${bucketName}`);
    
    // Create a policy name based on the app name
    const policyName = `${appName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-policy`;
    
    // Create the policy content
    const policyContent = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            's3:ListAllMyBuckets',
            's3:ListBucket',
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject'
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/*`
          ]
        }
      ]
    };
    
    // Create the policy file locally in the minio/policies directory
    const localPolicyDir = path.join(process.cwd(), 'minio', 'policies');
    const localPolicyPath = path.join(localPolicyDir, `${policyName}.json`);
    
    // Ensure the directory exists
    if (!fs.existsSync(localPolicyDir)) {
      fs.mkdirSync(localPolicyDir, { recursive: true });
    }
    
    // Write the policy file locally
    fs.writeFileSync(localPolicyPath, JSON.stringify(policyContent, null, 2));
    await logger.info(`Created policy file at ${localPolicyPath}`);
    
    // The file will be available in the container at /policies due to the volume mount
    const containerPolicyPath = `/policies/${policyName}.json`;
    
    // Create the policy using the file
    await execCommand(`docker compose exec minio mc admin policy create myminio ${policyName} ${containerPolicyPath}`);
    
    // Attach the policy to the user
    await execCommand(`docker compose exec minio mc admin policy attach myminio ${policyName} --user ${accessKey}`);
    
    await logger.info(`Successfully created and attached policy ${policyName} to user ${accessKey}`);
    return true;
  } catch (error) {
    await logger.error(`Failed to create and attach policy for user ${accessKey}:`, error as Error);
    return false;
  }
}

async function setBucketPolicy(bucketName: string, accessKey: string): Promise<boolean> {
  try {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        // Allow public read access to all objects
        {
          Effect: 'Allow',
          Principal: {
            AWS: ['*']
          },
          Action: [
            's3:GetObject'
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}/*`
          ]
        },
        // Allow the app's user full access to their bucket
        {
          Effect: 'Allow',
          Principal: {
            AWS: [`arn:aws:iam:::user/${accessKey}`]
          },
          Action: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}/*`,
            `arn:aws:s3:::${bucketName}`
          ]
        }
      ]
    };

    await logger.info(`Setting bucket policy for ${bucketName} - public read access with full access for ${accessKey}...`);
    await client.setBucketPolicy(bucketName, JSON.stringify(policy));
    await logger.info(`Successfully set bucket policy for ${bucketName}`);
    return true;
  } catch (error) {
    await logger.error(`Failed to set bucket policy for ${bucketName}:`, error as Error);
    return false;
  }
}

export async function setupAppStorage(app: App): Promise<MinioCredentials> {
  try {
    // Generate unique identifiers
    const accessKey = await generateRandomString(20);
    const secretKey = await generateRandomString(40);
    const bucket = generateBucketName(app.name);

    await logger.info(`Setting up storage for app ${app.name} with bucket ${bucket}`);

    // Check if service credentials already exist in database
    const existingService = await fetchAppServiceCredentialsQuery(app.id, 'minio');

    if (existingService.length > 0) {
      await logger.info(`Found existing Minio service for app ${app.name}`);
      // Return existing credentials
      const service = existingService[0];
      return {
        public_key: service.public_key,
        secret_key: service.secret_key,
        bucket: bucket
      };
    }

    // Check if bucket exists but we don't have credentials
    const exists = await checkBucketExists(bucket);
    await logger.info(`Bucket ${bucket} ${exists ? 'exists' : 'does not exist'}`);
    
    if (!exists) {
      // Create new bucket if it doesn't exist
      const bucketCreated = await createBucket(bucket);
      if (!bucketCreated) {
        throw new Error(`Failed to create bucket ${bucket}`);
      }
      await logger.info(`Created new bucket ${bucket}`);
    }

    // Create Minio user with the generated credentials
    const userCreated = await createMinioUser(accessKey, secretKey);
    if (!userCreated) {
      throw new Error(`Failed to create Minio user for app ${app.name}`);
    }
    
    // Create and attach a policy for the user
    const policyAttached = await createAndAttachUserPolicy(app.name, accessKey, bucket);
    if (!policyAttached) {
      throw new Error(`Failed to create and attach policy for app ${app.name}`);
    }

    // Set policy for the bucket using the generated access key
    const policySet = await setBucketPolicy(bucket, accessKey);
    if (!policySet) {
      throw new Error(`Failed to set policy for bucket ${bucket}`);
    }

    // Store credentials in database
    await insertAppServiceCredentialsQuery(app.id, 'minio', accessKey, secretKey);

    await logger.info(`${exists ? 'Reconnected to' : 'Created'} Minio storage for app ${app.name}`);

    return {
      public_key: accessKey,
      secret_key: secretKey,
      bucket
    };
  } catch (error) {
    await logger.error(`Failed to setup Minio storage for app ${app.name}:`, error as Error);
    throw error;
  }
}

export function getMinioEnvVars(credentials: MinioCredentials, appName: string): Record<string, string> {
  return {
    MINIO_HOST: host,
    MINIO_ACCESS_KEY: credentials.public_key,
    MINIO_SECRET_KEY: credentials.secret_key,
    MINIO_BUCKET: credentials.bucket || generateBucketName(appName)
  };
}