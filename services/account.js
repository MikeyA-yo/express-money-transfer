import Account from "../models/accounts.js";
import {
  DuplicateAccountError,
  NotFoundError
} from "../common/domain-exceptions/domain-exceptions.js";

export async function createAccount(name, email, balance, options = {}) {
  const accountModel = options.Account || Account;
    
  const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  try {
    const existingAccount = await accountModel.findOne({ email });

    if (existingAccount) {
      throw DuplicateAccountError("Account already exists for this email", {resource: "Account", email});
    }

    return await accountModel.create({ id, name, email, balance });
  }catch(error) {
    throw error;
  }
}

export async function fetchAccounts(page = 1, limit = 10) {
  try {
    const accounts = await Account.find()
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    return accounts;
  } catch (error) {
    throw error;
  }
}

export async function getAccountById(id) {
    try {
        const account = await Account.findOne({ id });
        if (!account) {
            throw NotFoundError("Account not found", { resource: "Account", id });
        }
        return account;
    }catch (error) {
        throw error;
    }
}

export async function editAccount(id, name, email, balance) {
    try {
        const account = await Account.findOneAndUpdate({ id }, { name, email, balance }, { new: true });
        if (!account) {
            throw NotFoundError("Account not found", { resource: "Account", id });
        }
        return account;
    } catch (error) {
        throw error;
    }
}

export async function removeAccount(id) {
    try {
        const account = await Account.findOneAndDelete({ id });
        if (!account) {
            throw NotFoundError("Account not found", { resource: "Account", id });
        }
        return account;
    } catch (error) {
        throw error;
    }
}