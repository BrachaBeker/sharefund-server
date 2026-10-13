import { Router } from 'express';
import { prisma } from '../db/prisma';
import authRoutes from './auth.routes';
import groupRoutes from './group.routes';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);

export default router;
