import envPackage from "@next/env";
import {
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const { loadEnvConfig } = envPackage;
loadEnvConfig(process.cwd());

const required = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT", "S3_BUCKET", "APP_URL"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const Bucket = process.env.S3_BUCKET;
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "eu-central-003",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [process.env.APP_URL],
          AllowedMethods: ["PUT"],
          AllowedHeaders: ["Content-Type"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

await client.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket,
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "expire-user-files-after-one-day",
          Status: "Enabled",
          Filter: { Prefix: "" },
          Expiration: { Days: 1 },
        },
        {
          ID: "delete-expired-object-markers",
          Status: "Enabled",
          Filter: { Prefix: "" },
          Expiration: { ExpiredObjectDeleteMarker: true },
        },
      ],
    },
  }),
);

const cors = await client.send(new GetBucketCorsCommand({ Bucket }));
const lifecycle = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }));
console.log(JSON.stringify({ cors: cors.CORSRules, lifecycle: lifecycle.Rules }, null, 2));
