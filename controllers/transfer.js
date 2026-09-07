import { StatusCodes } from 'http-status-codes';
import logger from '../config/logger.js';
import { newTransfer, listTransfers, getTransferById } from '../services/transfer.js';

async function createTransfer(req, res) {
    const { fromAccountId, toAccountId, amount } = req.body;
    const transferRes = await newTransfer(fromAccountId, toAccountId, amount);

    logger.info("Transfer completed", {
        transferId: transferRes._id,
        fromAccountId,
        toAccountId,
        amount: transferRes.amount.toString(),
    });

    return res.status(StatusCodes.CREATED).json(transferRes);
}

async function getTransfers(req, res) {
    const { page = 1, limit = 10 } = req.query;
    const transfers = await listTransfers(page, limit);
    return res.status(StatusCodes.OK).json(transfers);
}

async function getTransfer(req, res) {
    const { id } = req.params;
    const transfer = await getTransferById(id);
    return res.status(StatusCodes.OK).json(transfer);
}

export { createTransfer, getTransfers, getTransfer };