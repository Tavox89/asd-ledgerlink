import { prisma } from '../../lib/prisma';

export async function getHealthStatus() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

export async function getReadinessStatus() {
  await prisma.$queryRaw`SELECT 1`;

  return {
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'ok',
    },
  };
}
