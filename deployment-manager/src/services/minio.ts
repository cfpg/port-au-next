import { Client } from 'minio';
import crypto from 'crypto';
import pool from '~/services/database';
import logger from '~/services/logger';

const rootUser = process.env.MINIO_ROOT_USER || 'minioadmin';
const rootPassword = process.env.MINIO_ROOT_PASSWORD || 'minioadmin';
const host = process.env.MINIO_HOST || 'localhost:9000';

const client = new Client({
  endPoint: 'minio',
  port: 80,
  useSSL: false,
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

async function createBucket(bucketName: string): Promise<void> {
  await client.makeBucket(bucketName, 'us-east-1');
}

async function setBucketPolicy(bucketName: string, accessKey: string): Promise<void> {
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

  await client.setBucketPolicy(bucketName, JSON.stringify(policy));
}

export async function setupAppStorage(appId: number, appName: string): Promise<MinioCredentials> {
  try {
    // Generate unique identifiers
    const accessKey = await generateRandomString(20);
    const secretKey = await generateRandomString(40);
    const bucket = `${appName}-bucket`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Check if service credentials already exist
    const existingService = await pool.query(
      'SELECT * FROM app_services WHERE app_id = $1 AND service_type = $2',
      [appId, 'minio']
    );

    if (existingService.rows.length > 0) {
      // Return existing credentials
      const service = existingService.rows[0];
      return {
        accessKey: service.public_key,
        secretKey: service.secret_key,
        bucket: bucket
      };
    }

    // Create Minio resources
    await createBucket(bucket);
    await setBucketPolicy(bucket, accessKey);

    // Store credentials in database
    await pool.query(
      `INSERT INTO app_services 
       (app_id, service_type, public_key, secret_key) 
       VALUES ($1, $2, $3, $4)`,
      [appId, 'minio', accessKey, secretKey]
    );

    await logger.info(`Created Minio storage for app ${appName}`);

    return {
      accessKey,
      secretKey,
      bucket
    };
  } catch (error) {
    await logger.error(`Failed to setup Minio storage for app ${appName}:`, error as Error);
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