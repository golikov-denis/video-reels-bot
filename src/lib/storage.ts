import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cachedClient: S3Client | undefined;

function readStorageConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = {
    accessKeyId: env.S3_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: env.S3_SECRET_ACCESS_KEY?.trim() ?? "",
    endpoint: env.S3_ENDPOINT?.trim() ?? "",
    region: env.S3_REGION?.trim() ?? "",
    bucket: env.S3_BUCKET?.trim() ?? "",
  };

  if (Object.values(config).some((value) => !value)) {
    throw new Error("Object storage is not configured");
  }
  return config;
}

function getClient(config: ReturnType<typeof readStorageConfig>): S3Client {
  cachedClient ??= new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return cachedClient;
}

export async function createUploadUrl(
  objectKey: string,
  contentType: string,
): Promise<string> {
  const config = readStorageConfig();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  return getSignedUrl(getClient(config), command, { expiresIn: 600 });
}

export async function inspectUpload(objectKey: string): Promise<{
  size: number;
  contentType: string;
}> {
  const config = readStorageConfig();
  const result = await getClient(config).send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }),
  );

  return {
    size: result.ContentLength ?? -1,
    contentType: result.ContentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "",
  };
}

export async function createSourceUrl(objectKey: string): Promise<string> {
  const config = readStorageConfig();
  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { expiresIn: 3600 },
  );
}

export async function createDownloadUrl(objectKey: string): Promise<string> {
  const config = readStorageConfig();
  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ResponseContentDisposition: 'attachment; filename="reel.mp4"',
      ResponseContentType: "video/mp4",
    }),
    { expiresIn: 600 },
  );
}

export async function uploadResult(
  objectKey: string,
  filePath: string,
): Promise<number> {
  const config = readStorageConfig();
  const file = await stat(filePath);
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: createReadStream(filePath),
      ContentLength: file.size,
      ContentType: "video/mp4",
    }),
  );
  return file.size;
}
