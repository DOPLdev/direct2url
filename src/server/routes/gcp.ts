import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Storage } from '@google-cloud/storage';
import { logger } from '../utils/logger';

const router = Router();

// Validation schema for GCP request
const gcpRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1),
  config: z.object({
    provider: z.literal('gcp'),
    bucket: z.string().min(1),
    projectId: z.string().min(1),
    keyFile: z.string().min(1),
  }),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = gcpRequestSchema.parse(req.body);
    const { fileName, fileType, config } = validatedData;

    // Parse service account key
    let credentials;
    try {
      credentials = JSON.parse(config.keyFile);
    } catch (parseError) {
      logger.error('Failed to parse GCP service account key', {
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
        requestId: req.headers['x-request-id'],
      });
      return res.status(400).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid service account key format',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string,
        },
      });
    }

    // Create Storage client
    const storage = new Storage({
      projectId: config.projectId,
      credentials,
    });

    const bucket = storage.bucket(config.bucket);
    const file = bucket.file(fileName);

    // Generate signed URL (valid for 1 hour)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      contentType: fileType,
    });

    logger.info('GCP signed URL generated', {
      fileName,
      bucket: config.bucket,
      requestId: req.headers['x-request-id'],
    });

    res.json({ signedUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('GCP request validation failed', {
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

    logger.error('GCP signed URL generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      error: {
        code: 'GCP_ERROR',
        message: 'Failed to generate GCP signed URL',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string,
      },
    });
  }
});

export const gcpRoutes = router; 