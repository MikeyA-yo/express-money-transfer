import express from 'express';
import {
    createExternalTransferHandler,
    getExternalTransferHandler,
    listExternalTransfersHandler,
    resolveAccountHandler,
    verifyExternalTransferStatusHandler
} from '../controllers/externalTransfer.js';
import { schemaMiddleware } from '../request-schemas/index.js';
import {
    externalTransferSchema,
    resolveAccountQuerySchema,
    externalTransferParams
} from '../request-schemas/externalTransfer.schema.js';
import { transferHeaders } from '../request-schemas/transfer.schema.js';
import { authenticate, requireRole, requireRoles } from '../middlewares/index.js';

const router = express.Router();

router.get(
    '/resolve-account',
    authenticate(),
    requireRoles(['user', 'admin', 'superadmin']),
    schemaMiddleware(resolveAccountQuerySchema, 'query'),
    resolveAccountHandler()
);

router.post(
    '/',
    authenticate(),
    requireRole('user'),
    schemaMiddleware(transferHeaders, 'headers'),
    schemaMiddleware(externalTransferSchema, 'body'),
    createExternalTransferHandler()
);

router.get(
    '/',
    authenticate(),
    requireRoles(['user', 'admin', 'superadmin']),
    listExternalTransfersHandler()
);

router.get(
    '/:id/status',
    authenticate(),
    requireRoles(['user', 'admin', 'superadmin']),
    schemaMiddleware(externalTransferParams, 'params'),
    verifyExternalTransferStatusHandler()
);

router.get(
    '/:id',
    authenticate(),
    requireRoles(['user', 'admin', 'superadmin']),
    schemaMiddleware(externalTransferParams, 'params'),
    getExternalTransferHandler()
);

export default router;
