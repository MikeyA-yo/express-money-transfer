import express from "express";
import { getAccounts, getAccount, createAccount, updateAccount, deleteAccount } from "../controllers/account.js";
import baseValidatorSchema from "../validators/index.js";
import { accountSchema, validateAccountParams, accountParams } from "../validators/account.validator.dto.js";

const router = express.Router();

// router.use(baseValidatorSchema(accountSchema));

router.get("/", async (req, res) => {
   await getAccounts(req, res);
});

router.get("/:id", async (req, res) => {
    await getAccount(req, res);
});

router.post("/", baseValidatorSchema(accountSchema), async (req, res) => {
     await createAccount(req, res);
});

router.patch("/:id", validateAccountParams(accountParams), async (req, res) => {
    await updateAccount(req, res);
});

router.delete("/:id",validateAccountParams(accountParams), async (req, res) => {
    await deleteAccount(req, res);
});

export default router;