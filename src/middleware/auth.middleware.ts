import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { logger } from '../utils/logger';

// Extracts user from JWT but does NOT block unauthenticated requests.
// Individual resolvers call requireAuth() when they need authentication.
export async function authMiddleware(
  req: Request & { user?: { id: string; email: string; role: string } },
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const blacklisted = await authService.isTokenBlacklisted(token);
    if (blacklisted) {
      next();
      return;
    }

    const payload = authService.verifyAccessToken(token);
    req.user = { id: payload.userId, email: payload.email, role: payload.role };
  } catch {
    // Token invalid — proceed without user; resolvers will reject if auth required
    logger.debug('Invalid token presented', { ip: req.ip });
  }

  next();
}
