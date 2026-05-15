import { authService } from '../../services/auth.service';
import { GraphQLContext } from '../../types/context';
import { AuthenticationError } from '../../utils/errors';
import { requireAuth } from '../helpers';

export const authResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      const { queryOne } = await import('../../config/database');
      const user = await queryOne(
        `SELECT id, email, name, role, is_active, last_login_at, created_at
         FROM users WHERE id = $1`,
        [ctx.user!.id]
      );
      if (!user) throw new AuthenticationError();
      return user;
    },
  },

  Mutation: {
    register: async (_: unknown, { input }: { input: unknown }) => {
      return authService.register(input);
    },

    login: async (_: unknown, { input }: { input: unknown }) => {
      return authService.login(input);
    },

    logout: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      const token = ctx.req.headers.authorization?.replace('Bearer ', '') ?? '';
      await authService.logout(ctx.user!.id, token);
      return true;
    },

    refreshTokens: async (_: unknown, { refreshToken }: { refreshToken: string }) => {
      return authService.refreshTokens(refreshToken);
    },

    changePassword: async (
      _: unknown,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      await authService.changePassword(ctx.user!.id, currentPassword, newPassword);
      return true;
    },
  },

  User: {
    isActive: (parent: { is_active: boolean }) => parent.is_active,
    lastLoginAt: (parent: { last_login_at: Date }) => parent.last_login_at,
    createdAt: (parent: { created_at: Date }) => parent.created_at,
  },
};
