import { z } from 'zod';
import { ValidationError } from './errors';

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['admin', 'operator', 'viewer']).default('operator'),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const createFacilitySchema = z.object({
  name: z.string().min(2).max(255),
  location: z.string().min(2).max(255),
  type: z.enum(['warehouse', 'manufacturing', 'distribution', 'port']),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const createAssetSchema = z.object({
  facility_id: uuidSchema,
  name: z.string().min(2).max(255),
  type: z.string().min(2).max(100),
  serial_number: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const createEventSchema = z.object({
  asset_id: uuidSchema,
  facility_id: uuidSchema,
  type: z.string().min(2).max(100),
  severity: z.enum(['info', 'warning', 'critical']),
  data: z.record(z.unknown()),
  source: z.string().min(1).max(255),
});

export const createAlertSchema = z.object({
  facility_id: uuidSchema.optional(),
  asset_id: uuidSchema.optional(),
  event_id: uuidSchema.optional(),
  title: z.string().min(3).max(255),
  description: z.string().max(2000).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    result.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ValidationError('Validation failed', fields);
  }
  return result.data;
}
