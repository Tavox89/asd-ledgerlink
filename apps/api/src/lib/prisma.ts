import { PrismaClient } from './prisma-runtime';

declare global {
  // eslint-disable-next-line no-var
  var __ledgerlinkPrisma__: PrismaClient | undefined;
}

export const prisma =
  global.__ledgerlinkPrisma__ ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__ledgerlinkPrisma__ = prisma;
}
