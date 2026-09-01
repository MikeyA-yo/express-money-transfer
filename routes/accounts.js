import express from "express";
import { getAccounts, getAccount, createAccount, updateAccount, deleteAccount } from "../controllers/account.js";

const router = express.Router();

router.get("/", async (req, res) => {
   await getAccounts(req, res);
});

router.get("/:id", async (req, res) => {
    await getAccount(req, res);
});

router.post("/", async (req, res) => {
     await createAccount(req, res);
});

router.patch("/:id", async (req, res) => {
    await updateAccount(req, res);
});

router.delete("/:id", async (req, res) => {
    await deleteAccount(req, res);
});

export default router;