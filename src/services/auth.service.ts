import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { query, queryOne, withTransaction } from '../config/database';
import { redis } from '../config/redis';
import { User } from '../types/models';
import { JWTPayload } from '../types/context';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors';
import { validate, registerSchema, loginSchema } from '../utils/validators';
import { logger } from '../utils/logger';

const BCRYPT_ROUNDS = 12;
const TOKEN_BLACKLIST_PREFIX = 'koi:blacklist:';
const REFRESH_TOKEN_PREFIX = 'koi:refresh:';

export class AuthService {
  async register(input: unknown) {
    const data = validate(registerSchema, input);

    const existing = await queryOne<User>(
      'SELECT id FROM users WHERE email = $1',
      [data.email]
    );
    if (existing) throw new ConflictError('Email already registered');

    const password_hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = await queryOne<User>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, is_active, created_at`,
      [data.email, password_hash, data.name, data.role]
    );

    logger.info('User registered', { userId: user!.id, email: user!.email });
    return user!;
  }

  async login(input: unknown) {
    const data = validate(loginSchema, input);

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
      [data.email]
    );
    if (!user) throw new AuthenticationError('Invalid email or password');

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) throw new AuthenticationError('Invalid email or password');

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const accessToken = this.signAccessToken(user);
    const { token: refreshToken, hash } = this.generateRefreshToken();

    await withTransaction(async (client) => {
      // Remove old refresh tokens for this user (keep last 5)
      await client.query(
        `DELETE FROM refresh_tokens
         WHERE user_id = $1 AND id NOT IN (
           SELECT id FROM refresh_tokens WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 4
         )`,
        [user.id]
      );

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await client.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, hash, expiresAt]
      );
    });

    logger.info('User logged in', { userId: user.id });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    const hash = this.hashToken(refreshToken);

    const record = await queryOne<{
      id: string;
      user_id: string;
      expires_at: Date;
      revoked: boolean;
    }>(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [hash]
    );

    if (!record || record.revoked || new Date(record.expires_at) < new Date()) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE id = $1 AND is_active = TRUE',
      [record.user_id]
    );
    if (!user) throw new AuthenticationError('User not found');

    // Rotate refresh token
    const { token: newRefreshToken, hash: newHash } = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await withTransaction(async (client) => {
      await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [record.id]);
      await client.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, newHash, expiresAt]
      );
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string, accessToken: string): Promise<void> {
    // Blacklist the access token until it expires
    const decoded = jwt.decode(accessToken) as JWTPayload;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(`${TOKEN_BLACKLIST_PREFIX}${accessToken}`, ttl, '1');
      }
    }

    await query(
      'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
      [userId]
    );

    logger.info('User logged out', { userId });
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await redis.get(`${TOKEN_BLACKLIST_PREFIX}${token}`);
    return result !== null;
  }

  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new NotFoundError('User');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new ForbiddenError('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

    // Revoke all refresh tokens
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);
    logger.info('Password changed', { userId });
  }

  private signAccessToken(user: User): string {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );
  }

  private generateRefreshToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(64).toString('hex');
    return { token, hash: this.hashToken(token) };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const authService = new AuthService();
