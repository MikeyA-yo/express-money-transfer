import { createMoney, toAmount, toMajorFormat, toMinorFormat } from "../common/money-value-object/index.js";

function formatStoredAmount(amount) {
  const money = createMoney(amount);
  return {
    major: toMajorFormat(money),
    minor: toMinorFormat(money),
    minorUnits: Number(toAmount(money).toString())
  };
}

export const toAccountResponse = (account) => {
  const balance = formatStoredAmount(account.balance);
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    balance: balance.major,
    balanceMinor: balance.minor,
  };
};

export const toAccountsResponse = (accounts) => accounts.map(toAccountResponse);

export const toTransferResponse = (transfer) => {
  const amount = transfer.amount != null ? formatStoredAmount(transfer.amount) : null;
  return {
    id: transfer.id,
    status: transfer.status || "COMPLETED",
    from: transfer.fromAccountId || transfer.from,
    to: transfer.toAccountId || transfer.to,
    fromAccountId: transfer.fromAccountId || transfer.from,
    toAccountId: transfer.toAccountId || transfer.to,
    amount: amount ? amount.minorUnits : 0,
    amountMinor: amount ? amount.minor : 0,
    amountMajor: amount ? amount.major : 0,
  };
};

export const toTransfersResponse = (transfers) => transfers.map(toTransferResponse);