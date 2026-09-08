export const toTransferResponse = (transfer) => ({
  id: transfer.id,
  from: transfer.fromAccountId,
  to: transfer.toAccountId,
  amount: Number(transfer.amount.toString())
});

export const toTransfersResponse = (transfers) => transfers.map(toTransferResponse);