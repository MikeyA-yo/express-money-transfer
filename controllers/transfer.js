import { StatusCodes } from 'http-status-codes';
import logger from '../config/logger.js';
import * as transferService from '../services/transfer.js';

export const createTransferHandler = ({ newTransfer = transferService.newTransfer } = {}) => async (req, res) => {
    const { fromAccountId, toAccountId, amount } = req.body;
    const transferRes = await newTransfer(fromAccountId, toAccountId, amount, req.user);

    logger.info("Transfer completed", {
        transferId: transferRes._id || transferRes.id,
        fromAccountId,
        toAccountId,
        amount: transferRes.amount?.toString?.() ?? transferRes.amount,
        initiatedBy: req.user?.id
    });

    return res.status(StatusCodes.CREATED).json(transferRes);
};

export const getTransfersHandler = ({ listTransfers = transferService.listTransfers } = {}) => async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const transfers = await listTransfers(page, limit);
    return res.status(StatusCodes.OK).json(transfers);
};

export const getTransferHandler = ({ getTransferById = transferService.getTransferById } = {}) => async (req, res) => {
    const { id } = req.params;
    const transfer = await getTransferById(id);
    return res.status(StatusCodes.OK).json(transfer);
};
