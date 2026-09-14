import express from "express";
import { createAccountHandler, getAccountHandler, getAccountsHandler, updateAccountHandler, deleteAccountHandler } from "../controllers/account.js";
import { schemaMiddleware } from "../request-schemas/index.js";
import { accountParams, getAccountSchema } from "../request-schemas/account.schema.js";
import { authenticate, requireRole, requireRoles } from '../middlewares/index.js';

const router = express.Router();

router.get("/", authenticate(), requireRoles(['admin', 'superadmin']), getAccountsHandler());

router.get("/:id", schemaMiddleware(accountParams, "params"), authenticate(), requireRoles(['user', 'admin', 'superadmin']), getAccountHandler());

router.post("/", schemaMiddleware(getAccountSchema, "body"), createAccountHandler());

router.patch("/:id", schemaMiddleware(accountParams, "params"), authenticate(), requireRole('user'), updateAccountHandler());

router.delete("/:id", schemaMiddleware(accountParams, "params"), authenticate(), requireRole('user'), deleteAccountHandler());

export default router;
