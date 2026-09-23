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

export const toExternalTransferResponse = (transfer) => {
  const raw = transfer.toObject ? transfer.toObject() : transfer;
  const amountBig = BigInt(raw.amount);
  const money = createMoney(amountBig);
  return {
    id: raw.id,
    fromAccountId: raw.fromAccountId,
    amount: Number(amountBig),
    amountMajor: toMajorFormat(money),
    amountMinor: toMinorFormat(money),
    currency: raw.currency || 'NGN',
    reference: raw.reference,
    transferCode: raw.transferCode || null,
    recipientCode: raw.recipientCode || null,
    recipient: raw.recipient,
    status: raw.status,
    reason: raw.reason || null,
    failureReason: raw.failureReason || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  };
};

export const toExternalTransfersResponse = (transfers) => transfers.map(toExternalTransferResponse);