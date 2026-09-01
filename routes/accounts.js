import express from "express";
import { getAccounts, getAccount, createAccount, updateAccount, deleteAccount } from "../controllers/accounts.js";

const router = express.Router();

router.get("/", (req, res) => {
    getAccounts(req, res);
});

router.get("/:id", (req, res) => {
    getAccount(req, res);
});

router.post("/", (req, res) => {
     createAccount(req, res);
});

router.patch("/:id", (req, res) => {
    updateAccount(req, res);
});

router.delete("/:id", (req, res) => {
    deleteAccount(req, res);
});

export default router;