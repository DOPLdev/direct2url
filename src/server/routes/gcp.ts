import { Router, Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schema for GCP request
const gcpConfigSchema = z.object({
  fileName: z.string().min(1),
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
    const validatedData = gcpConfigSchema.parse(req.body);
    const { fileName, fileType, config } = validatedData;

    const storage = new Storage({
      projectId: config.projectId,
      keyFilename: config.keyFile,
    });

    const bucket = storage.bucket(config.bucket);
    const file = bucket.file(fileName);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      contentType: fileType,
    });

    logger.info('GCP signed URL generated', { fileName, bucket: config.bucket });

    return res.json({ signedUrl });
  } catch (error) {
    logger.error('Error generating GCP signed URL', { error });
    return res.status(400).json({
      error: {
        code: 'GCP_SIGNED_URL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate signed URL',
        timestamp: new Date().toISOString(),
      }
    });
  }
});

export const gcpRoutes = router; 