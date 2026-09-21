import mongoose from "mongoose";
import Transfer from "../models/transfer.js";
import Account from "../models/accounts.js";
import User from "../models/user.js";
import {
  NotFoundError,
  InsufficientFundsError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
  UnprocessableEntityError,
} from "../common/domain-exceptions/domain-exceptions.js";
import {
  toTransferResponse,
  toTransfersResponse,
} from "../response-schema/index.js";
import {
  createMoney,
  sum,
  subtractMoney,
  toAmount,
  Money,
} from "../common/money-value-object/index.js";
import {
  getRedisClient,
  fingerprint,
  createRedisKey,
  createRedisLockKey,
  acquireLock,
  releaseLock,
  set,
  get,
  del,
} from "../util/idempotency.js";

const models = {
  Transfer,
  Account,
  User,
};

/**
 * Resolve the authenticated user's linked account from persistence.
 * JWT claims are identity only; ownership is verified against Account.userId.
 */
async function resolveOwnedAccountId(actor, { Account = models.Account, User = models.User } = {}) {
  if (!actor || !actor.id) {
    throw UnauthorizedError("Authentication required");
  }

  const user = await User.findOne({ id: actor.id });
  if (!user) {
    throw UnauthorizedError("Authenticated user not found");
  }

  const account = await Account.findOne({ userId: actor.id, deleted: { $ne: true } });
  if (!account) {
    throw UnauthorizedError("No account found for authenticated user");
  }

  return account.id;
}

/**
 * The debit account must be the account linked to the authenticated user.
 * Checked before any account lookup so a non-owner cannot probe existence.
 */
function assertOwnsSourceAccount(ownedAccountId, fromAccountId) {
  if (!ownedAccountId || ownedAccountId !== fromAccountId) {
    throw ForbiddenError(
      "Cannot initiate transfer from an account you do not own",
      {
        resource: "Account",
        id: fromAccountId,
      },
    );
  }
}

export async function newTransfer(
  fromAccountId,
  toAccountId,
  amount,
  actor,
  idempotencyKey,
  {
    Transfer = models.Transfer,
    Account = models.Account,
    User = models.User,
    redis,
  } = {},
) {
  if (!idempotencyKey) {
    throw BadRequestError("Missing Idempotency-Key");
  }

  // TODO! Import the direct connection from the main service. Do not call it here
  const client = redis !== undefined ? redis : await getRedisClient().catch(() => null);

  const ownedAccountId = await resolveOwnedAccountId(actor, { Account, User });
  assertOwnsSourceAccount(ownedAccountId, fromAccountId);

  if (fromAccountId === toAccountId) {
    throw BadRequestError("Cannot transfer to the same account");
  }

  const reqFingerprint = fingerprint({
    fromAccountId,
    toAccountId,
    amount: amount?.toString?.() ?? amount,
  });

  const redisKey = createRedisKey("transfer", actor?.id, idempotencyKey);
  const lockKey = createRedisLockKey("transfer", actor?.id, idempotencyKey);

  // 1. Check if record exists first
  const existingRaw = await get(client, redisKey);
  if (existingRaw) {
    const existing = JSON.parse(existingRaw);

    // 2. Compare fingerprints
    if (existing.fingerprint !== reqFingerprint) {
      throw UnprocessableEntityError("Idempotency key reused with different request body");
    }

    if (existing.status === "COMPLETED") {
      return existing.response;
    }

    if (existing.status === "PENDING") {
      throw ConflictError("A request with this Idempotency-Key is currently being processed. Please retry shortly.");
    }
  }

  // 3. If not exists, acquire lock
  const locked = await acquireLock(client, lockKey, 30);
  if (!locked) {
    throw ConflictError("A request with this Idempotency-Key is currently being processed. Please retry shortly.");
  }

  // Create PENDING record
  await set(
    client,
    redisKey,
    JSON.stringify({
      status: "PENDING",
      fingerprint: reqFingerprint,
      createdAt: new Date().toISOString(),
    }),
    { EX: 300 }
  );

  try {
    const session = await mongoose.startSession();
    let transfer;

    try {
      await session.withTransaction(async () => {
        const accountFrom = await Account.findOne({
          id: fromAccountId,
          deleted: { $ne: true },
        }).session(session);
        const accountTo = await Account.findOne({
          id: toAccountId,
          deleted: { $ne: true },
        }).session(session);

        if (!accountFrom || !accountTo) {
          const missingId = !accountFrom ? fromAccountId : toAccountId;
          throw NotFoundError("Account not found", {
            resource: "Account",
            id: missingId,
          });
        }

        //TODO: FROM HERE --- hint: do an atomic increment/decrement of the balances instead of doing a read-modify-write to avoid race conditions.
        //TODO Use MongoDB's $inc operator for atomic updates.

        // new implementation using $inc for atomic updates
        let fromRes = await Account.updateOne(
          { id: fromAccountId, balance: { $gte: BigInt(amount) } },
          { $inc: { balance: -BigInt(amount) } },
          { session }
        )

        if (fromRes.modifiedCount === 0) {
          throw InsufficientFundsError("Insufficient funds", {
            fromBalance: accountFrom.balance.toString(),
            transferAmount: BigInt(amount).toString(),
          });
        }

        let toRes = await Account.updateOne(
          { id: toAccountId },
          { $inc: { balance: BigInt(amount) } },
          { session }
        )

        if (toRes.modifiedCount === 0) {
          throw NotFoundError("Account not found", {
            resource: "Account",
            id: toAccountId,
          });
        }

        // const fromBalance = accountFrom.balance;
        const transferAmount = BigInt(amount);

        // if (fromBalance < transferAmount) {
        //   throw InsufficientFundsError("Insufficient funds", {
        //     fromBalance: fromBalance.toString(),
        //     transferAmount: transferAmount.toString(),
        //   });
        // }

        // const fromMoney = createMoney(fromBalance);
        // const toMoney = createMoney(accountTo.balance);
        // const transferMoney = createMoney(transferAmount);

        // const fromMoneyBalance = subtractMoney(fromMoney, transferMoney);
        // const toMoneyBalance = sum(toMoney, transferMoney);

        // accountFrom.balance = toAmount(fromMoneyBalance);
        // accountTo.balance = toAmount(toMoneyBalance);

        //TODO: TO HERE ---
        // await accountFrom.save({ session });
        // await accountTo.save({ session });

        transfer = new Transfer({
          id: new mongoose.Types.ObjectId().toString(),
          fromAccountId,
          toAccountId,
          amount: transferAmount,
        });

        await transfer.save({ session });
      });

      const output = {
        ...transfer.toObject(),
        status: "COMPLETED",
      };
      const formatOutput = toTransferResponse(output);

      // Save COMPLETED result in Redis for 24h
      await set(
        client,
        redisKey,
        JSON.stringify({
          status: "COMPLETED",
          fingerprint: reqFingerprint,
          response: formatOutput,
          completedAt: new Date().toISOString(),
        }),
        { EX: 86400 }
      );

      return formatOutput;
    } finally {
      await session.endSession();
    }
  } catch (err) {
    // Release pending record on failure so client can retry
    await del(client, redisKey);
    throw err;
  } finally {
    // Release mutex lock
    await releaseLock(client, lockKey);
  }
}

export async function listTransfers(
  page = 1,
  limit = 10,
  { Transfer = models.Transfer } = {},
) {
  const transfers = await Transfer.find()
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  return toTransfersResponse(transfers);
}

export async function getTransferById(id, { Transfer = models.Transfer } = {}) {
  const transfer = await Transfer.findOne({ id });
  if (!transfer) {
    throw NotFoundError("Transfer not found", { resource: "Transfer", id });
  }
  return toTransferResponse(transfer);
}
