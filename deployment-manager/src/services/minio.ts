import * as Minio from 'minio';
import crypto from 'crypto';
import logger from '~/services/logger';
import { App } from '~/types';
import { generateBucketName } from '~/utils/bucket';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import insertAppServiceCredentialsQuery from '~/queries/insertAppServiceCredentialsQuery';
import { execCommand } from '~/utils/docker';

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
  accessKey: string;
  secretKey: string;
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

async function setBucketPolicy(bucketName: string, accessKey: string): Promise<boolean> {
  try {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            AWS: [`arn:aws:iam:::user/${accessKey}`]
          },
          Action: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket'
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}/*`,
            `arn:aws:s3:::${bucketName}`
          ]
        }
      ]
    };

    await logger.info(`Setting bucket-specific policy for ${bucketName} to allow only access key ${accessKey}...`);
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
        accessKey: service.public_key,
        secretKey: service.secret_key,
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

    // Set policy for the bucket using the generated access key
    const policySet = await setBucketPolicy(bucket, accessKey);
    if (!policySet) {
      throw new Error(`Failed to set policy for bucket ${bucket}`);
    }

    // Store credentials in database
    await insertAppServiceCredentialsQuery(app.id, 'minio', accessKey, secretKey);

    await logger.info(`${exists ? 'Reconnected to' : 'Created'} Minio storage for app ${app.name}`);

    return {
      accessKey,
      secretKey,
      bucket
    };
  } catch (error) {
    await logger.error(`Failed to setup Minio storage for app ${app.name}:`, error as Error);
    throw error;
  }
}

export function getMinioEnvVars(credentials: MinioCredentials): Record<string, string> {
  return {
    MINIO_HOST: host,
    MINIO_ACCESS_KEY: credentials.accessKey,
    MINIO_SECRET_KEY: credentials.secretKey,
    MINIO_BUCKET: credentials.bucket
  };
} 