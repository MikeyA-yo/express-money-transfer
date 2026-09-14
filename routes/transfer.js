import express from "express";
import { createTransferHandler, getTransferHandler, getTransfersHandler } from "../controllers/transfer.js";
import { schemaMiddleware } from "../request-schemas/index.js";
import { transferSchema, transferParams } from "../request-schemas/transfer.schema.js";
import { authenticate, requireRole, requireRoles } from '../middlewares/index.js';

const router = express.Router();

router.post("/", schemaMiddleware(transferSchema, "body"), authenticate(), requireRole('user'), createTransferHandler());

router.get("/", authenticate(), requireRoles(['user', 'admin', 'superadmin']), getTransfersHandler());

router.get("/:id", schemaMiddleware(transferParams, "params"), authenticate(), requireRoles(['user', 'admin', 'superadmin']), getTransferHandler());

export default router;
