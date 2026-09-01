import express from "express";
import { getAccounts } from "../controllers/accounts.js";

const router = express.Router();

router.get("/", (req, res) => {
    getAccounts(req, res);
})