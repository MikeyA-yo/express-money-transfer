import mongoose from 'mongoose';
import Transfer from '../models/transfer.js';
import Account from '../models/accounts.js';
// import { transferDTO } from '../validators/transfer.validator.dto.js';
import {
    NotFoundError,
    InsufficientFundsError
} from '../common/domain-exceptions/domain-exceptions.js';
import { toTransferResponse, toTransfersResponse } from '../response-schema/index.js';

function toDecimal128(value) {
    return mongoose.Types.Decimal128.fromString(String(value));
}

const models = {
    Transfer,
    Account
};

 function assertAccountBelongsToUser(account, userId) {
    if (account.userId !== userId) {
        throw new UnauthorizedError('Account does not belong to the authenticated user', { resource: 'Account', id: account.id });
    }}


export async function newTransfer(fromAccountId, toAccountId, amount, { Transfer = models.Transfer, Account = models.Account } = {}) {
    assertAccountBelongsToUser(await Account.findOne({ id: fromAccountId }), req.user.id);
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
        return toTransferResponse(output);
    } catch (error) {
        throw error;
    } finally {
        await session.endSession();
    }
}

export async function listTransfers(page = 1, limit = 10, { Transfer = models.Transfer } = {}) {
    try {
        const transfers = await Transfer.find()
                    .skip((page - 1) * limit)
                    .limit(parseInt(limit));
        return toTransfersResponse(transfers);
    } catch (error) {
        throw error;
    }
}

export async function getTransferById(id, { Transfer = models.Transfer } = {}) {
    try {
        const transfer = await Transfer.findOne({ id });
        if (!transfer) {
            throw NotFoundError('Transfer not found', { resource: 'Transfer', id });
        }
        return toTransferResponse(transfer);
    } catch (error) {
        throw error;
    }
}