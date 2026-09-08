import Account  from "../models/accounts.js";
import {
  DuplicateAccountError,
  NotFoundError
} from "../common/domain-exceptions/domain-exceptions.js";
import { toAccountResponse, toAccountsResponse } from "../response-schema/account.res.js";

export async function createAccount(name, email, balance, options = {}, { account = Account } = {}) {
  const accountModel = options.Account || account;
    
  const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  try {
    const existingAccount = await accountModel.findOne({ email });

    if (existingAccount) {
      throw DuplicateAccountError("Account already exists for this email", {resource: "Account", email});
    }

    return toAccountResponse(await accountModel.create({ id, name, email, balance }));
  }catch(error) {
    throw error;
  }
}

export async function fetchAccounts(page = 1, limit = 10, { account = Account } = {}) {
  try {
    const accounts = await account.find()
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    return toAccountsResponse(accounts);
  } catch (error) {
    throw error;
  }
}

export async function getAccountById(id, {account = Account} = {}) {
    try {
        const account = await account.findOne({ id });
        if (!account) {
            throw NotFoundError("Account not found", { resource: "Account", id });
        }
        return toAccountResponse(account);
    }catch (error) {
        throw error;
    }
}

export async function editAccount(id, name, email, balance, {account = Account} = {}) {
    try {
        const account = await account.findOneAndUpdate({ id }, { name, email, balance }, { new: true });
        if (!account) {
            throw NotFoundError("Account not found", { resource: "Account", id });
        }
        return toAccountResponse(account);
    } catch (error) {
        throw error;
    }a
}

export async function removeAccount(id, {account = Account} = {}) {
    try {
        const account = await account.findOneAndDelete({ id });
        if (!account) {
            throw NotFoundError("Account not found", { resource: "Account", id });
        }
        return toAccountResponse(account);
    } catch (error) {
        throw error;
    }
}