import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
  }
}

export class ApiErrorHandler {
  static handle(error: Error, req: Request, res: Response, _next: NextFunction) {
    const requestId = req.headers['x-request-id'] as string || 'unknown';
    
    const response: ApiError = {
      error: {
        code: error.name || 'INTERNAL_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    
    logger.error('API Error', { 
      error: error.message, 
      stack: error.stack,
      requestId,
      url: req.url,
      method: req.method
    });
    
    res.status(500).json(response);
  }
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  ApiErrorHandler.handle(error, req, res, next);
}; 