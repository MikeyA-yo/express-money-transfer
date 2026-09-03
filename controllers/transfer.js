import mongoose from 'mongoose';
import Transfer from '../models/transfer.js';
import Account from '../models/accounts.js';
import logger from '../config/logger.js';
import { transferDTO } from '../validators/transfer.validator.dto.js';

// import transferSchema from '../validators/transfer.validator.dto.js';

function toDecimal128(value) {
    return mongoose.Types.Decimal128.fromString(String(value));
}

async function createTransfer(req, res) {
    const { fromAccountId, toAccountId, amount } = req.body;
    const session = await mongoose.startSession();
    let transfer;

    try {
        await session.withTransaction(async () => {
            const accountFrom = await Account.findOne({ id: fromAccountId }).session(session);
            const accountTo = await Account.findOne({ id: toAccountId }).session(session);

            if (!accountFrom || !accountTo) {
                throw Object.assign(new Error('Account not found'), { statusCode: 404 });
            }

            const fromBalance = BigInt(accountFrom.balance.toString());
            const transferAmount = BigInt(String(amount));

            if (fromBalance < transferAmount) {
                throw Object.assign(new Error('Insufficient funds'), { statusCode: 400 });
            }

            accountFrom.balance = toDecimal128((fromBalance - transferAmount).toString());
            accountTo.balance = toDecimal128((BigInt(accountTo.balance.toString()) + transferAmount).toString());

            await accountFrom.save({ session });
            await accountTo.save({ session });

            transfer = new Transfer({
                id: new mongoose.Types.ObjectId().toString(),
                fromAccountId,
                toAccountId,
                amount: toDecimal128(transferAmount.toString()),
            });

            await transfer.save({ session });
        });
        const output = {
            ...transfer.toObject(),
            status: "COMPLETED",
        }
        logger.info("Transfer completed", {
            transferId: transfer.id,
            fromAccountId,
            toAccountId,
            amount: transfer.amount.toString(),
        });
        res.status(201).json(transferDTO(output));
    } catch (error) {
        const statusCode = error.statusCode || 500;
        logger.error("CREATE TRANSFER ERROR:", error);
        res.status(statusCode).json({ fromAccountId, toAccountId, amount, status: "FAILED", error: error.message });
    } finally {
        await session.endSession();
    }
}

async function getTransfers(req, res) {
    const { page = 1, limit = 10 } = req.query;
    try {
        const transfers = await Transfer.find()
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        return res.status(200).json(transfers);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function getTransfer(req, res) {
    const { id } = req.params;
    try {
        const transfer = await Transfer.findOne({ id });
        if (!transfer) {
            return res.status(404).json({ error: 'Transfer not found' });
        }
        return res.status(200).json(transfer);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

export { createTransfer, getTransfers, getTransfer };