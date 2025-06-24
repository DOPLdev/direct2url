import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { logger } from '../utils/logger';

const router = Router();

// Validation schema for Azure request
const azureRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1),
  config: z.object({
    provider: z.literal('azure'),
    accountName: z.string().min(1),
    containerName: z.string().min(1),
    accountKey: z.string().optional(),
    sasToken: z.string().optional(),
  }).refine(data => data.accountKey || data.sasToken, {
    message: "Either accountKey or sasToken must be provided",
  }),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = azureRequestSchema.parse(req.body);
    const { fileName, fileType, config } = validatedData;

    let signedUrl: string;

    if (config.accountKey) {
      // Use account key authentication
      const sharedKeyCredential = new StorageSharedKeyCredential(
        config.accountName,
        config.accountKey
      );

      const blobServiceClient = new BlobServiceClient(
        `https://${config.accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );

      const containerClient = blobServiceClient.getContainerClient(config.containerName);
      const blobClient = containerClient.getBlobClient(fileName);

      // Generate SAS token
      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: config.containerName,
          blobName: fileName,
          permissions: BlobSASPermissions.parse("w"),
          startsOn: new Date(),
          expiresOn: new Date(new Date().valueOf() + 60 * 60 * 1000), // 1 hour
        },
        sharedKeyCredential
      );

      signedUrl = `${blobClient.url}?${sasToken}`;
    } else if (config.sasToken) {
      // Use provided SAS token
      const blobServiceClient = new BlobServiceClient(
        `https://${config.accountName}.blob.core.windows.net?${config.sasToken}`
      );

      const containerClient = blobServiceClient.getContainerClient(config.containerName);
      const blobClient = containerClient.getBlobClient(fileName);
      signedUrl = blobClient.url;
    } else {
      throw new Error('No authentication method provided');
    }

    logger.info('Azure SAS URL generated', {
      fileName,
      container: config.containerName,
      requestId: req.headers['x-request-id'],
    });

    res.json({ signedUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Azure request validation failed', {
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

    logger.error('Azure SAS URL generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      error: {
        code: 'AZURE_ERROR',
        message: 'Failed to generate Azure SAS URL',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string,
      },
    });
  }
});

export const azureRoutes = router; 