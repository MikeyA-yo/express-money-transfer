import mongoose from 'mongoose';
import Transfer from '../models/transfer.js';
import Account from '../models/accounts.js';
import { transferDTO } from '../validators/transfer.validator.dto.js';
import {
    NotFoundError,
    InsufficientFundsError
} from '../common/domain-exceptions/domain-exceptions.js';

function toDecimal128(value) {
    return mongoose.Types.Decimal128.fromString(String(value));
}

export async function newTransfer(fromAccountId, toAccountId, amount) {
    const session = await mongoose.startSession();
    let transfer;
    try {
        await session.withTransaction(async () => {
            const accountFrom = await Account.findOne({ id: fromAccountId }).session(session);
            const accountTo = await Account.findOne({ id: toAccountId }).session(session);

             if (!accountFrom || !accountTo) {
                const missingId = !accountFrom ? fromAccountId : toAccountId;
                throw NotFoundError('Account not found', { resource: 'Account', id: missingId });
            }

            const fromBalance = BigInt(accountFrom.balance.toString());
            const transferAmount = BigInt(String(amount));

            if (fromBalance < transferAmount) {
                throw InsufficientFundsError('Insufficient funds', {
                    fromBalance: fromBalance.toString(),
                    transferAmount: transferAmount.toString()
                });
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
        };
        return transferDTO(output);
    } catch (error) {
        throw error;
    } finally {
        await session.endSession();
    }
}

export async function listTransfers(page = 1, limit = 10) {
    try {
        const transfers = await Transfer.find()
                    .skip((page - 1) * limit)
                    .limit(parseInt(limit));
        return transfers;
    } catch (error) {
        throw error;
    }
}

export async function getTransferById(id) {
    try {
        const transfer = await Transfer.findOne({ id });
        if (!transfer) {
            throw NotFoundError('Transfer not found', { resource: 'Transfer', id });
        }
        return transfer;
    } catch (error) {
        throw error;
    }
}