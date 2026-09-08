export const toTransferResponse = (transfer) => ({
  id: transfer.id,
  status: transfer.status || "COMPLETED",
  from: transfer.fromAccountId || transfer.from,
  to: transfer.toAccountId || transfer.to,
  fromAccountId: transfer.fromAccountId || transfer.from,
  toAccountId: transfer.toAccountId || transfer.to,
  amount: transfer.amount != null ? Number(transfer.amount.toString()) : 0
});

export const toTransfersResponse = (transfers) => transfers.map(toTransferResponse);