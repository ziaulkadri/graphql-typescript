import { Request, Response } from 'express';
import DataLoader from 'dataloader';
import { User, Facility, Asset } from './models';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface DataLoaders {
  facilityLoader: DataLoader<string, Facility | null>;
  assetLoader: DataLoader<string, Asset | null>;
  userLoader: DataLoader<string, User | null>;
}

export interface GraphQLContext {
  req: Request;
  res: Response;
  user: AuthUser | null;
  loaders: DataLoaders;
  requestId: string;
}
