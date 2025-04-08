import { auth } from './auth';
import { APIError } from "better-auth/api";
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getServiceContainerIp } from '~/services/docker';
import { createServiceVhostConfig } from '~/services/nginx';
import logger from '~/services/logger';

const execAsync = promisify(exec);

export async function ensureAdminUser() {
  const email = process.env.DEPLOYMENT_MANAGER_AUTH_EMAIL;
  const password = process.env.DEPLOYMENT_MANAGER_AUTH_PASSWORD;

  if (!email || !password) {
    throw new Error('DEPLOYMENT_MANAGER_AUTH_EMAIL and DEPLOYMENT_MANAGER_AUTH_PASSWORD must be set.');
  }

  try {
    // Try to create the user first
    await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: 'Admin User'
      }
    });
    console.log('Admin user created successfully');
  } catch (error) {
    if (error instanceof APIError) {
      // If user already exists, skip creation.
      if (error.status === 422 || error.message.includes('User already exists')) {
        console.log('Admin user already exists, skipping creation.');
      } else {
        console.error('Error creating admin user:', error.message, error.status);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

export async function setupImgproxy(): Promise<void> {
  const imgproxyHost = process.env.IMGPROXY_HOST;
  if (!imgproxyHost) {
    throw new Error('IMGPROXY_HOST environment variable is not set');
  }

  try {
    // Get Imgproxy container IP
    const containerIp = await getServiceContainerIp('imgproxy');
    
    // Create nginx config for Imgproxy
    await createServiceVhostConfig(
      'imgproxy',
      imgproxyHost,
      [
        {
          path: '/',
          proxyPass: `http://${containerIp}:80`
        }
      ],
      {
        clientMaxBodySize: '50M'
      }
    );

    await logger.info('Imgproxy setup completed successfully');
  } catch (error) {
    await logger.error('Error setting up Imgproxy', error as Error);
    throw error;
  }
}

export async function setupMinio(): Promise<void> {
  const minioHost = process.env.MINIO_HOST;
  if (!minioHost) {
    throw new Error('MINIO_HOST environment variable is not set');
  }

  try {
    // Get Minio container IP
    const containerIp = await getServiceContainerIp('minio');
    
    // Create nginx config for Minio API only
    await createServiceVhostConfig(
      'minio',
      minioHost,
      [
        {
          path: '/',
          proxyPass: `http://${containerIp}:80`
        }
      ],
      {
        clientMaxBodySize: '50M'
      }
    );

    await logger.info('Minio setup completed successfully');
  } catch (error) {
    await logger.error('Error setting up Minio', error as Error);
    throw error;
  }
} 