import Account from "../models/accounts.js";
import logger from "../config/logger.js";

async function createAccount(req, res) {
    const { name, email, balance } = req.body;
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);

    try {
        const existingAccount = await Account.findOne({ email });

        if (existingAccount) {
            return res.status(409).json({ error: "Account already exists for this email" });
        }

        const newAccount = new Account({ id, name, email, balance });
        const savedAccount = await newAccount.save();
        logger.info("Account created", { accountId: savedAccount.id });

        return res.status(201).json(savedAccount);
    } catch (error) {
        logger.error("CREATE ACCOUNT ERROR:", error);
        return res.status(500).json({ error: error.message });
    }
}

async function getAccounts(req, res){
 const { page = 1, limit = 10 } = req.query;
    try {
        const accounts = await Account.find()
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        return res.status(200).json(accounts);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function getAccount(req, res){
    const { id } = req.params;
    try {
        const account = await Account.findOne({ id });
        if (!account) {
            return res.status(404).json({ error: "Account not found" });
        }
        return res.status(200).json(account);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function updateAccount(req, res){
    const { id } = req.params;
    const { name, email, balance } = req.body;
    try {
        const account = await Account.findOneAndUpdate({ id }, { name, email, balance }, { new: true });
        if (!account) {
            return res.status(404).json({ error: "Account not found" });
        }
        return res.status(200).json(account);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function deleteAccount(req, res){
    const { id } = req.params;
    try {
        const account = await Account.findOneAndDelete({ id });
        if (!account) {
            return res.status(404).json({ error: "Account not found" });
        }
        return res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

export { createAccount, getAccounts, getAccount, updateAccount, deleteAccount };