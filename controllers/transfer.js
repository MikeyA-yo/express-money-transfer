import { StatusCodes } from 'http-status-codes';
import logger from '../config/logger.js';
import * as transferService from '../services/transfer.js';

// async function createTransfer(req, res, { newTransfer = transferService.createTransfer } = {}) {
//     const { fromAccountId, toAccountId, amount } = req.body;
//     const transferRes = await newTransfer(fromAccountId, toAccountId, amount);

//     logger.info("Transfer completed", {
//         transferId: transferRes._id,
//         fromAccountId,
//         toAccountId,
//         amount: transferRes.amount.toString(),
//     });

//     return res.status(StatusCodes.CREATED).json(transferRes);
// }

export const createTransferHandler = ({ newTransfer = transferService.newTransfer } = {}) => async (req, res) => {
    const { fromAccountId, toAccountId, amount } = req.body;
    const transferRes = await newTransfer(fromAccountId, toAccountId, amount);

    logger.info("Transfer completed", {
        transferId: transferRes._id,
        fromAccountId,
        toAccountId,
        amount: transferRes.amount.toString(),
    });

    return res.status(StatusCodes.CREATED).json(transferRes);
};

// async function getTransfers(req, res, { listTransfers = transferService.listTransfers } = {}) {
//     const { page = 1, limit = 10 } = req.query;
//     const transfers = await listTransfers(page, limit);
//     return res.status(StatusCodes.OK).json(transfers);
// }

export const getTransfersHandler = ({ listTransfers = transferService.listTransfers } = {}) => async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const transfers = await listTransfers(page, limit);
    return res.status(StatusCodes.OK).json(transfers);
};

// async function getTransfer(req, res, { getTransferById = transferService.getTransferById } = {}) {
//     const { id } = req.params;
//     const transfer = await getTransferById(id);
//     return res.status(StatusCodes.OK).json(transfer);
// }

export const getTransferHandler = ({ getTransferById = transferService.getTransferById } = {}) => async (req, res) => {
    const { id } = req.params;
    const transfer = await getTransferById(id);
    return res.status(StatusCodes.OK).json(transfer);
};

// export { createTransfer, getTransfers, getTransfer };