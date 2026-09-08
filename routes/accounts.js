import express from "express";
import baseValidatorSchema from "../validators/index.js";
// import { accountSchema, validateAccountParams, accountParams } from "../validators/account.validator.dto.js";
import { createAccountHandler, getAccountHandler, getAccountsHandler, updateAccountHandler, deleteAccountHandler } from "../controllers/account.js";
import {schemaMiddleware} from "../request-schemas/index.js";
import { accountParams, getAccountSchema } from "../request-schemas/account.schema.js";


const router = express.Router();

// router.use(baseValidatorSchema(accountSchema));

router.get("/", getAccountsHandler());

router.get("/:id", schemaMiddleware(accountParams, "params"), getAccountHandler());

router.post("/", schemaMiddleware(getAccountSchema, "body"),  createAccountHandler());

router.patch("/:id", schemaMiddleware(accountParams, "params"), updateAccountHandler());

router.delete("/:id",schemaMiddleware(accountParams, "params"), deleteAccountHandler());

export default router;