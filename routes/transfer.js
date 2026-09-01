import express from "express";
import { createTransfer, getTransfers, getTransfer } from "../controllers/transfer.js";

const router = express.Router();

router.post("/", async (req, res) => {
    await createTransfer(req, res);
});

router.get("/", async (req, res) => {
    await getTransfers(req, res);
});

router.get("/:id", async (req, res) => {
    await getTransfer(req, res);
});

export default router;