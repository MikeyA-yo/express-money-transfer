import express from "express";
// import { createTransfer, getTransfers, getTransfer } from "../controllers/transfer.js";
// import { transferSchema, validateTransfer, transferParams, validateTransferParams  } from "../validators/transfer.validator.dto.js";
import { createTransferHandler, getTransferHandler, getTransfersHandler } from "../controllers/transfer.js";
import { schemaMiddleware } from "../request-schemas/index.js";
import { transferSchema, transferParams } from "../request-schemas/transfer.schema.js";
const router = express.Router();

router.post("/", schemaMiddleware(transferSchema, "body"), createTransferHandler());

router.get("/", getTransfersHandler());

router.get("/:id", schemaMiddleware(transferParams, "params"), getTransferHandler());

export default router;