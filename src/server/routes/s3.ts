import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schema for S3 request
const s3ConfigSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  config: z.object({
    provider: z.literal('s3'),
    bucket: z.string().min(1),
    region: z.string().min(1),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().optional(),
    endpoint: z.string().optional(),
  }),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = s3ConfigSchema.parse(req.body);
    const { fileName, fileType, config } = validatedData;

    const s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        ...(config.sessionToken && { sessionToken: config.sessionToken }),
      },
      ...(config.endpoint && { endpoint: config.endpoint }),
    });

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: fileName,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    logger.info('S3 presigned URL generated', { fileName, bucket: config.bucket });

    return res.json({ signedUrl });
  } catch (error) {
    logger.error('Error generating S3 presigned URL', { error });
    return res.status(400).json({
      error: {
        code: 'S3_PRESIGNED_URL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate presigned URL',
        timestamp: new Date().toISOString(),
      }
    });
  }
});

export const s3Routes = router; 