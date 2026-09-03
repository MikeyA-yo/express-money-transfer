import express from "express";
import { createTransfer, getTransfers, getTransfer } from "../controllers/transfer.js";
import { transferSchema, validateTransfer, transferParams, validateTransferParams  } from "../validators/transfer.validator.dto.js";

const router = express.Router();

router.post("/", validateTransfer(transferSchema),async (req, res) => {
    await createTransfer(req, res);
});

router.get("/", async (req, res) => {
    await getTransfers(req, res);
});

router.get("/:id", validateTransferParams(transferParams), async (req, res) => {
    await getTransfer(req, res);
});

export default router;