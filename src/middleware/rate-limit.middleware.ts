import rateLimit from 'express-rate-limit';
import { redis } from '../config/redis';
import { config } from '../config';

// General API rate limiter
export const apiRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: [{ message: 'Too many requests, please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
  skip: (req) => req.ip === '127.0.0.1' && config.NODE_ENV === 'development',
});

// Stricter limiter for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: [{ message: 'Too many authentication attempts, please try again in 15 minutes.', extensions: { code: 'RATE_LIMITED' } }] },
});
