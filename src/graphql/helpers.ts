import { GraphQLContext } from '../types/context';
import { AuthenticationError, ForbiddenError } from '../utils/errors';

export function requireAuth(ctx: GraphQLContext): void {
  if (!ctx.user) throw new AuthenticationError();
}

export function requireRole(ctx: GraphQLContext, ...roles: string[]): void {
  requireAuth(ctx);
  if (!roles.includes(ctx.user!.role)) {
    throw new ForbiddenError(`Requires one of roles: ${roles.join(', ')}`);
  }
}
