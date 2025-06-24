import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger';

const router = Router();

// Validation schema for S3 request
const s3RequestSchema = z.object({
  fileName: z.string().min(1).max(255),
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
    // Validate request body
    const validatedData = s3RequestSchema.parse(req.body);
    const { fileName, fileType, config } = validatedData;

    // Create S3 client
    const s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      },
      endpoint: config.endpoint,
    });

    // Create command for presigned URL
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: fileName,
      ContentType: fileType,
    });

    // Generate presigned URL (valid for 1 hour)
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    logger.info('S3 presigned URL generated', {
      fileName,
      bucket: config.bucket,
      requestId: req.headers['x-request-id'],
    });

    res.json({ signedUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('S3 request validation failed', {
        errors: error.errors,
        requestId: req.headers['x-request-id'],
      });
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string,
        },
      });
    }

    logger.error('S3 presigned URL generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      error: {
        code: 'S3_ERROR',
        message: 'Failed to generate S3 presigned URL',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string,
      },
    });
  }
});

export const s3Routes = router; 