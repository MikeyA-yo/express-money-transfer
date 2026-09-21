import Account from "../models/accounts.js";
import {
  DuplicateAccountError,
  NotFoundError,
  BadRequestError
} from "../common/domain-exceptions/domain-exceptions.js";
import { toAccountResponse, toAccountsResponse } from "../response-schema/index.js";

const models = {
  Account
};

export async function createAccount(name, email, balance, userId, options = {}) {
  const accountModel = options.Account || options.account || models.Account;
  const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);

  if (!userId) {
    throw BadRequestError("User ID is required");
  }

  try {
    const existingAccount = await accountModel.findOne({ email });

    if (existingAccount) {
      throw DuplicateAccountError("Account already exists for this email", { resource: "Account", email });
    }

    const created = await accountModel.create({ id, name, email, balance, userId });
    return toAccountResponse(created);
  } catch (error) {
    throw error;
  }
}

export async function fetchAccounts(page = 1, limit = 10, { Account = models.Account, account = Account } = {}) {
  const accountModel = account || Account;
  try {
    const accounts = await accountModel.find({ deleted: { $ne: true } })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    return toAccountsResponse(accounts);
  } catch (error) {
    throw error;
  }
}

export async function getAccountById(id, { Account = models.Account, account = Account } = {}) {
  const accountModel = account || Account;
  try {
    const foundAccount = await accountModel.findOne({ id });
    if (!foundAccount) {
      throw NotFoundError("Account not found", { resource: "Account", id });
    }
    return toAccountResponse(foundAccount);
  } catch (error) {
    throw error;
  }
}

export async function editAccount(id, name, email, balance, { Account = models.Account, account = Account } = {}) {
  const accountModel = account || Account;
  try {
    const updatedAccount = await accountModel.findOneAndUpdate({ id }, { name, email, balance }, { new: true });
    if (!updatedAccount) {
      throw NotFoundError("Account not found", { resource: "Account", id });
    }
    return toAccountResponse(updatedAccount);
  } catch (error) {
    throw error;
  }
}

export async function removeAccount(id, { Account = models.Account, account = Account } = {}) {
  const accountModel = account || Account;
  try {
    // i decide to soft delete the account instead of hard delete, so that we can keep the history of the account and its transactions
    const deletedAccount = await accountModel.findOneAndUpdate({ id }, { $set: { deleted: true } }, { new: true });
    if (!deletedAccount) {
      throw NotFoundError("Account not found", { resource: "Account", id });
    }
    return toAccountResponse(deletedAccount);
  } catch (error) {
    throw error;
  }
}