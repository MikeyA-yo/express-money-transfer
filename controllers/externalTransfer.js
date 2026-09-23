import { StatusCodes } from 'http-status-codes';
import logger from '../config/logger.js';
import * as externalTransferService from '../services/externalTransfer.js';
import * as paystackGateway from '../gateways/paystack/transfer.js';

export const createExternalTransferHandler = ({ initiateTransfer = externalTransferService.initiateExternalTransfer } = {}) => async (req, res) => {
    const { fromAccountId, amountMinor, recipientAccountNumber, recipientBankCode, recipientName, reason } = req.body;
    const idempotencyKey = req.headers?.['x-idempotency-key'] || req.validatedData?.['x-idempotency-key'];

    const recipientData = {
        accountNumber: recipientAccountNumber,
        bankCode: recipientBankCode,
        accountName: recipientName,
        reason
    };

    const transferRes = await initiateTransfer(
        fromAccountId,
        amountMinor,
        recipientData,
        req.user,
        idempotencyKey
    );

    logger.info('External transfer initiated', {
        transferId: transferRes.id,
        reference: transferRes.reference,
        fromAccountId,
        amount: transferRes.amount,
        status: transferRes.status,
        initiatedBy: req.user?.id
    });

    return res.status(StatusCodes.CREATED).json(transferRes);
};

export const getExternalTransferHandler = ({ getTransfer = externalTransferService.getExternalTransferById } = {}) => async (req, res) => {
    const { id } = req.params;
    const transfer = await getTransfer(id);
    return res.status(StatusCodes.OK).json(transfer);
};

export const listExternalTransfersHandler = ({ listTransfers = externalTransferService.listExternalTransfers } = {}) => async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user?.role === 'admin' ? null : req.user?.id;
    const transfers = await listTransfers(userId, page, limit);
    return res.status(StatusCodes.OK).json(transfers);
};

export const resolveAccountHandler = ({ resolveAccount = paystackGateway.resolveAccount } = {}) => async (req, res) => {
    const { accountNumber, bankCode } = req.query;
    const resolved = await resolveAccount(accountNumber, bankCode);
    return res.status(StatusCodes.OK).json(resolved);
};

export const verifyExternalTransferStatusHandler = ({ verifyStatus = externalTransferService.verifyExternalTransferStatus } = {}) => async (req, res) => {
    const { id } = req.params;
    const transfer = await verifyStatus(id, req.user);
    return res.status(StatusCodes.OK).json(transfer);
};

