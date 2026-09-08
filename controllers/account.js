import { StatusCodes } from "http-status-codes";
import logger from "../config/logger.js";
import * as accountService from "../services/account.js";


export const createAccountHandler = ({newAccount = accountService.createAccount} = {}) => async (req, res) => {
 const { name, email, balance } = req.body;
  const savedAccount = await newAccount(name, email, balance);
  logger.info("Account created", { accountId: savedAccount.id });
  return res.status(StatusCodes.CREATED).json(savedAccount);};

// async function getAccounts(req, res, {fetchAccounts} = {}) {
//   const { page = 1, limit = 10 } = req.query;
//   const accounts = await fetchAccounts(page, limit);
//   return res.status(StatusCodes.OK).json(accounts);
// }

export const getAccountsHandler = ({fetchAccounts = accountService.fetchAccounts} = {}) => async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const accounts = await fetchAccounts(page, limit);
  return res.status(StatusCodes.OK).json(accounts);
}

// async function getAccount(req, res, {getAccountById = accountService.getAccountById} = {}) {
//   const { id } = req.params;
//   const account = await getAccountById(id);
//   return res.status(StatusCodes.OK).json(account);
// }

export const getAccountHandler = ({getAccountById = accountService.getAccountById} = {}) => async (req, res) => {
  const { id } = req.params;
  const account = await getAccountById(id);
  return res.status(StatusCodes.OK).json(account);
}

// async function updateAccount(req, res, {editAccount = accountService.editAccount} = {}) {
//   const { id } = req.params;
//   const { name, email, balance } = req.body;
//   const account = await editAccount(id, name, email, balance);
//   return res.status(StatusCodes.OK).json(account);
// }

export const updateAccountHandler = ({editAccount = accountService.editAccount} = {}) => async (req, res) => {
  const { id } = req.params;
  const { name, email, balance } = req.body;
  const account = await editAccount(id, name, email, balance);
  return res.status(StatusCodes.OK).json(account);
}

// async function deleteAccount(req, res, {removeAccount = accountService.removeAccount} = {}) {
//   const { id } = req.params;
//   await removeAccount(id);
//   return res.status(StatusCodes.OK).json({ message: "Account deleted successfully" });
// }

export const deleteAccountHandler = ({removeAccount = accountService.removeAccount} = {}) => async (req, res) => {
  const { id } = req.params;
  await removeAccount(id);
  return res.status(StatusCodes.OK).json({ message: "Account deleted successfully" });
}

// export { createAccount, getAccounts, getAccount, updateAccount, deleteAccount };