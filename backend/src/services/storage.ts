import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export interface StoredObject {
  url: string;
  objectKey: string;
  size: number;
  mimeType: string;
}

// The MinIO client is loaded lazily so the API still boots (with local-disk
// storage) when the optional dependency or the MinIO container is absent.
type MinioClient = {
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string, region?: string): Promise<void>;
  setBucketPolicy(bucket: string, policy: string): Promise<void>;
  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    size: number,
    meta: Record<string, string>
  ): Promise<unknown>;
};

let client: MinioClient | null = null;
let ready = false;

async function getClient(): Promise<MinioClient | null> {
  if (!env.minio.enabled) return null;
  if (client && ready) return client;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Client } = require('minio') as { Client: new (opts: unknown) => MinioClient };
    client = new Client({
      endPoint: env.minio.endPoint,
      port: env.minio.port,
      useSSL: env.minio.useSSL,
      accessKey: env.minio.accessKey,
      secretKey: env.minio.secretKey,
    });

    const exists = await client.bucketExists(env.minio.bucket);
    if (!exists) {
      await client.makeBucket(env.minio.bucket, 'us-east-1');
      await client.setBucketPolicy(
        env.minio.bucket,
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${env.minio.bucket}/*`],
            },
          ],
        })
      );
    }

    ready = true;
    return client;
  } catch (err) {
    console.warn('[storage] MinIO unavailable, falling back to local disk:', (err as Error).message);
    client = null;
    return null;
  }
}

function objectKeyFor(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${stamp}/${crypto.randomUUID()}${ext}`;
}

export async function storeFile(file: {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}): Promise<StoredObject> {
  const objectKey = objectKeyFor(file.originalname);
  const minio = await getClient();

  // URLs are stored relative on purpose. MinIO's own endpoint is an internal
  // hostname (`minio:9000`) that no browser can resolve, and an absolute
  // PUBLIC_URL would bake the origin into the database — breaking every stored
  // attachment the day the deployment moves behind a different host or TLS.
  // Both `/media` and `/uploads` are served from the app's own origin by the
  // reverse proxy in production and by the Vite proxy in development.
  if (minio) {
    await minio.putObject(env.minio.bucket, objectKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });
    return {
      url: `/media/${objectKey}`,
      objectKey,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  const target = path.join(env.uploadDir, objectKey);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.buffer);

  return {
    url: `/uploads/${objectKey}`,
    objectKey,
    size: file.size,
    mimeType: file.mimetype,
  };
}

export function ensureLocalUploadDir() {
  fs.mkdirSync(env.uploadDir, { recursive: true });
}
