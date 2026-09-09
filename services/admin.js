import Account from '../models/accounts.js';
import Transfer from '../models/transfer.js';
import { toTransfersResponse } from '../response-schema/index.js';

const models = {
  Account,
  Transfer
};

/**
 * Aggregate system-wide statistics for administrators
 */
export async function getSystemStats({ Account = models.Account, Transfer = models.Transfer } = {}) {
  const [totalAccounts, totalTransfers, accounts] = await Promise.all([
    Account.countDocuments({ deleted: { $ne: true } }),
    Transfer.countDocuments(),
    Account.find({ deleted: { $ne: true } }).select('balance')
  ]);

  const totalSystemBalance = accounts.reduce((sum, acc) => {
    return sum + (acc.balance ? Number(acc.balance.toString()) : 0);
  }, 0);

  return {
    totalAccounts,
    totalTransfers,
    totalSystemBalance: Number(totalSystemBalance.toFixed(2))
  };
}

/**
 * List all system transfers for audit
 */
export async function getAllTransfersAudit(page = 1, limit = 20, { Transfer = models.Transfer } = {}) {
  const transfers = await Transfer.find()
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  return toTransfersResponse(transfers);
}
