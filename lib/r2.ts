import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadToR2(
  buffer: Buffer,
  contentType: string,
  folder: string,
): Promise<string> {
  const ext = contentType.includes('video') ? 'mp4'
    : contentType.includes('png') ? 'png'
    : contentType.includes('webp') ? 'webp'
    : 'jpg';
  const key = `${folder}/${randomUUID()}.${ext}`;

  await getR2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

export async function deleteFromR2(url: string): Promise<void> {
  const publicUrl = process.env.R2_PUBLIC_URL!;
  if (!url.startsWith(publicUrl)) return;
  const key = url.slice(publicUrl.length + 1);

  await getR2Client().send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  }));
}
