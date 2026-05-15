import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { expressMiddleware } from '@as-integrations/express';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { v4 as uuidv4 } from 'uuid';

import { config } from './config';
import { checkDatabaseConnection } from './config/database';
import { checkRedisConnection } from './config/redis';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { createDataLoaders } from './graphql/dataloaders';
import { authMiddleware } from './middleware/auth.middleware';
import { apiRateLimiter } from './middleware/rate-limit.middleware';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { GraphQLContext } from './types/context';

async function bootstrap() {
  // ── Infrastructure checks ──────────────────────────────────────────────────
  await checkDatabaseConnection();
  await checkRedisConnection();

  // ── Express app ───────────────────────────────────────────────────────────
  const app = express();
  const httpServer = http.createServer(app);

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.NODE_ENV === 'production' }));
  app.use(cors({
    origin: config.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGINS?.split(',') ?? []
      : '*',
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(apiRateLimiter);
  app.use(authMiddleware as express.RequestHandler);

  // ── GraphQL Schema ────────────────────────────────────────────────────────
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // ── WebSocket server for subscriptions ───────────────────────────────────
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });

  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        const token = (ctx.connectionParams?.Authorization as string)?.replace('Bearer ', '');
        let user = null;
        if (token) {
          try {
            const { authService } = await import('./services/auth.service');
            const payload = authService.verifyAccessToken(token);
            user = { id: payload.userId, email: payload.email, role: payload.role };
          } catch {}
        }
        return { user, loaders: createDataLoaders(), requestId: uuidv4() };
      },
    },
    wsServer
  );

  // ── Apollo Server ─────────────────────────────────────────────────────────
  const apolloServer = new ApolloServer<GraphQLContext>({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
      ...(config.NODE_ENV !== 'production'
        ? [ApolloServerPluginLandingPageLocalDefault({ embed: true })]
        : []),
    ],
    formatError: (formattedError, error) => {
      logger.error('GraphQL error', {
        message: formattedError.message,
        code: formattedError.extensions?.code,
        path: formattedError.path,
      });

      // Strip internal details in production
      if (
        config.NODE_ENV === 'production' &&
        formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR'
      ) {
        return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
      }

      return formattedError;
    },
    introspection: config.NODE_ENV !== 'production',
  });

  await apolloServer.start();

  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req, res }): Promise<GraphQLContext> => {
        const user = (req as express.Request & { user?: GraphQLContext['user'] }).user ?? null;
        return {
          req,
          res,
          user,
          loaders: createDataLoaders(),
          requestId: uuidv4(),
        };
      },
    })
  );

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  });

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  // ── Start ─────────────────────────────────────────────────────────────────
  httpServer.listen(config.PORT, () => {
    logger.info(`🚀 Server ready at http://localhost:${config.PORT}/graphql`);
    logger.info(`🔌 WebSocket ready at ws://localhost:${config.PORT}/graphql`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    httpServer.close(async () => {
      const { pool } = await import('./config/database');
      const { redis } = await import('./config/redis');
      await pool.end();
      redis.disconnect();
      logger.info('Server shut down gracefully');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
