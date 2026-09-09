import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/index.js';
import { getSystemStatsHandler, getAllTransfersAuditHandler } from '../../controllers/admin.js';

const router = Router();

// Secure all admin routes with authentication and role check
router.use(authenticate());
router.use(authorize('admin'));

router.get('/stats', getSystemStatsHandler());
router.get('/transfers', getAllTransfersAuditHandler());

export default router;
