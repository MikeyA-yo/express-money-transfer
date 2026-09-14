import mongoose from 'mongoose';
import Transfer from '../models/transfer.js';
import Account from '../models/accounts.js';
import User from '../models/user.js';
import {
    NotFoundError,
    InsufficientFundsError,
    UnauthorizedError,
    ForbiddenError,
    BadRequestError
} from '../common/domain-exceptions/domain-exceptions.js';
import { toTransferResponse, toTransfersResponse } from '../response-schema/index.js';

function toDecimal128(value) {
    return mongoose.Types.Decimal128.fromString(String(value));
}

const models = {
    Transfer,
    Account,
    User
};

/**
 * Resolve the authenticated user's linked account from the user store.
 * JWT claims are identity only; ownership is always loaded from persistence.
 */
async function resolveOwnedAccountId(actor, { User = models.User } = {}) {
    if (!actor || !actor.id) {
        throw UnauthorizedError('Authentication required');
    }

    const user = await User.findOne({ id: actor.id });
    if (!user) {
        throw UnauthorizedError('Authenticated user not found');
    }

    return user.accountId;
}

/**
 * The debit account must be the account linked to the authenticated user.
 * Checked before any account lookup so a non-owner cannot probe existence.
 */
function assertOwnsSourceAccount(ownedAccountId, fromAccountId) {
    if (!ownedAccountId || ownedAccountId !== fromAccountId) {
        throw ForbiddenError('Cannot initiate transfer from an account you do not own', {
            resource: 'Account',
            id: fromAccountId
        });
    }
}

export async function newTransfer(
    fromAccountId,
    toAccountId,
    amount,
    actor,
    { Transfer = models.Transfer, Account = models.Account, User = models.User } = {}
) {
    const ownedAccountId = await resolveOwnedAccountId(actor, { User });
    assertOwnsSourceAccount(ownedAccountId, fromAccountId);

    if (fromAccountId === toAccountId) {
        throw BadRequestError('Cannot transfer to the same account');
    }

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
    } finally {
        await session.endSession();
    }
}

export async function listTransfers(page = 1, limit = 10, { Transfer = models.Transfer } = {}) {
    const transfers = await Transfer.find()
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    return toTransfersResponse(transfers);
}

export async function getTransferById(id, { Transfer = models.Transfer } = {}) {
    const transfer = await Transfer.findOne({ id });
    if (!transfer) {
        throw NotFoundError('Transfer not found', { resource: 'Transfer', id });
    }
    return toTransferResponse(transfer);
}
