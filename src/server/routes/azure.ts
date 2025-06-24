import { Router, Request, Response } from 'express';
import { BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions } from '@azure/storage-blob';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const router = Router();

const azureConfigSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  config: z.object({
    provider: z.literal('azure'),
    accountName: z.string().min(1),
    containerName: z.string().min(1),
    accountKey: z.string().optional(),
    sasToken: z.string().optional(),
  }),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = azureConfigSchema.parse(req.body);
    const { fileName, config } = validatedData;

    let blobServiceClient: BlobServiceClient;

    if (config.accountKey) {
      const sharedKeyCredential = new StorageSharedKeyCredential(
        config.accountName,
        config.accountKey
      );
      blobServiceClient = new BlobServiceClient(
        `https://${config.accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
    } else if (config.sasToken) {
      blobServiceClient = new BlobServiceClient(
        `https://${config.accountName}.blob.core.windows.net?${config.sasToken}`
      );
    } else {
      throw new Error('Either accountKey or sasToken must be provided');
    }

    const containerClient = blobServiceClient.getContainerClient(config.containerName);
    const blobClient = containerClient.getBlobClient(fileName);

    const sasUrl = await blobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("w"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    logger.info('Azure SAS URL generated', { fileName, container: config.containerName });

    return res.json({ signedUrl: sasUrl });
  } catch (error) {
    logger.error('Error generating Azure SAS URL', { error });
    return res.status(400).json({
      error: {
        code: 'AZURE_SAS_URL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate SAS URL',
        timestamp: new Date().toISOString(),
      }
    });
  }
});

export const azureRoutes = router; 