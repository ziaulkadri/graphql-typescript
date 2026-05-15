import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled Express error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    errors: [{ message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
  });
}

export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
