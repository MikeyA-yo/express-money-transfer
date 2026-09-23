import { Router } from "express";
import accountRoutes from "./accounts.js";
import transferRoutes from "./transfer.js";
import externalTransferRoutes from "./externalTransfer.js";
import webhookRoutes from "./webhook.js";
import adminRoutes from "./admin/index.js";
import authRoutes from "./auth.js";
import { responseTime, requestId } from "../middlewares/index.js";

const router = Router();

// Global API Middlewares (timing, correlation tracing)
router.use(requestId);
router.use(responseTime);

// Resource Routes
router.use("/auth", authRoutes);
router.use("/accounts", accountRoutes);
router.use("/transfers/external", externalTransferRoutes);
router.use("/transfers", transferRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/admin", adminRoutes);

export default router;