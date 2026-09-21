import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  newTransfer,
  getTransferById,
  listTransfers
} from '../../services/transfer.js';
import {
  NotFoundError,
  InsufficientFundsError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
  UnprocessableEntityError,
} from '../../common/domain-exceptions/domain-exceptions.js';
import { fingerprint } from '../../util/idempotency.js';

describe('TransferService', () => {
  let mockAccountModel;
  let mockTransferModel;
  let mockUserModel;
  let mockSession;
  let mockRedis;
  const actor = { id: 'usr-1', email: 'alice@test.com', role: 'user' };

  beforeEach(() => {
    mockSession = {
      withTransaction: mock.fn(async (cb) => await cb()),
      endSession: mock.fn(async () => undefined)
    };

    mock.method(mongoose, 'startSession', async () => mockSession);

    mockUserModel = {
      findOne: mock.fn(async (query) => {
        if (query?.id === actor.id) {
          return { id: actor.id, email: actor.email, role: actor.role };
        }
        return null;
      })
    };

    mockAccountModel = {
      findOne: mock.fn(async (query) => {
        if (query?.userId === actor.id) {
          return { id: 'acc-1', userId: actor.id, balance: 10000n };
        }
        return null;
      }),
      updateOne: mock.fn(async (filter, update, options) => {
        if (filter?.id === 'acc-1') {
          if (filter?.balance?.$gte && filter.balance.$gte > 10000n) {
            return { modifiedCount: 0 };
          }
          return { modifiedCount: 1 };
        }
        if (filter?.id === 'acc-2') {
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      })
    };

    mockTransferModel = mock.fn(function (data) {
      this.id = data.id || 'mock-transfer-id';
      this.fromAccountId = data.fromAccountId;
      this.toAccountId = data.toAccountId;
      this.amount = data.amount;
      this.save = mock.fn(async () => this);
      this.toObject = mock.fn(() => ({
        id: this.id,
        fromAccountId: this.fromAccountId,
        toAccountId: this.toAccountId,
        amount: this.amount
      }));
    });
    mockTransferModel.findOne = mock.fn();
    mockTransferModel.find = mock.fn();

    mockRedis = {
      get: mock.fn(async () => null),
      set: mock.fn(async () => 'OK'),
      del: mock.fn(async () => 1)
    };
  });

  afterEach(() => {
    mock.reset();
  });

  it('newTransfer - should throw BadRequestError if idempotencyKey is missing', async () => {
    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, '', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      BadRequestError
    );
  });

  it('newTransfer - should throw UnauthorizedError if actor is missing', async () => {
    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, undefined, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      UnauthorizedError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw UnauthorizedError if authenticated user is not found', async () => {
    mockUserModel.findOne = mock.fn(async () => null);

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      UnauthorizedError
    );

    assert.strictEqual(mockUserModel.findOne.mock.callCount(), 1);
    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw UnauthorizedError if no account belongs to the user', async () => {
    mockAccountModel.findOne = mock.fn(async () => null);

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      UnauthorizedError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw ForbiddenError if fromAccountId is not the authenticated user account', async () => {
    await assert.rejects(
      newTransfer('acc-someone-else', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      ForbiddenError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw BadRequestError if source and destination accounts are the same', async () => {
    await assert.rejects(
      newTransfer('acc-1', 'acc-1', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      BadRequestError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should return cached response if key exists and status is COMPLETED with matching fingerprint', async () => {
    const cachedResponse = {
      id: 'tr-cached',
      status: 'COMPLETED',
      from: 'acc-1',
      to: 'acc-2',
      amount: 5000
    };
    const reqFingerprint = fingerprint({ fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: '5000' });

    mockRedis.get = mock.fn(async () => JSON.stringify({
      status: 'COMPLETED',
      fingerprint: reqFingerprint,
      response: cachedResponse
    }));

    const result = await newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
      Account: mockAccountModel,
      Transfer: mockTransferModel,
      User: mockUserModel,
      redis: mockRedis
    });

    assert.deepStrictEqual(result, cachedResponse);
    // Database transaction should not be opened on cache hit
    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw UnprocessableEntityError if key exists with different fingerprint', async () => {
    mockRedis.get = mock.fn(async () => JSON.stringify({
      status: 'COMPLETED',
      fingerprint: 'different-fingerprint',
      response: {}
    }));

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      UnprocessableEntityError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw ConflictError if key exists with status PENDING', async () => {
    const reqFingerprint = fingerprint({ fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: '5000' });

    mockRedis.get = mock.fn(async () => JSON.stringify({
      status: 'PENDING',
      fingerprint: reqFingerprint
    }));

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      ConflictError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw ConflictError if lock cannot be acquired', async () => {
    mockRedis.get = mock.fn(async () => null);
    // Return null or false on lock attempt (mutex already held by concurrent request)
    mockRedis.set = mock.fn(async (key, val, opts) => {
      if (key.startsWith('lock:')) return null;
      return 'OK';
    });

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      ConflictError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw NotFoundError if sender account does not exist', async () => {
    const mockQueryFrom = { session: mock.fn(async () => null) };
    const mockQueryTo = { session: mock.fn(async () => ({ id: 'acc-2', balance: 10000n })) };

    mockAccountModel.findOne = mock.fn((filter) => {
      if (filter?.userId === actor.id) return Promise.resolve({ id: 'acc-1', userId: actor.id, balance: 10000n });
      if (filter?.id === 'acc-1') return mockQueryFrom;
      return mockQueryTo;
    });

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      NotFoundError
    );

    assert.strictEqual(mockSession.endSession.mock.callCount(), 1);
    // Lock should be released and pending record deleted
    assert.ok(mockRedis.del.mock.callCount() >= 1);
  });

  it('newTransfer - should throw InsufficientFundsError if sender balance is less than transfer amount', async () => {
    const accountFrom = {
      id: 'acc-1',
      balance: 3000n,
    };
    const accountTo = {
      id: 'acc-2',
      balance: 10000n,
    };

    const mockQueryFrom = { session: mock.fn(async () => accountFrom) };
    const mockQueryTo = { session: mock.fn(async () => accountTo) };

    mockAccountModel.findOne = mock.fn((filter) => {
      if (filter?.userId === actor.id) return Promise.resolve({ id: 'acc-1', userId: actor.id, balance: 3000n });
      if (filter?.id === 'acc-1') return mockQueryFrom;
      return mockQueryTo;
    });

    mockAccountModel.updateOne = mock.fn(async (filter, update) => {
      if (filter?.id === 'acc-1') {
        if (filter?.balance?.$gte && accountFrom.balance < filter.balance.$gte) {
          return { modifiedCount: 0 };
        }
        return { modifiedCount: 1 };
      }
      if (filter?.id === 'acc-2') {
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    });

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 5000, actor, 'idem-test-key', {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel,
        redis: mockRedis
      }),
      InsufficientFundsError
    );

    assert.strictEqual(mockSession.endSession.mock.callCount(), 1);
    assert.ok(mockRedis.del.mock.callCount() >= 1);
  });

  it('newTransfer - should complete transfer, update balances, save COMPLETED in Redis, and release lock', async () => {
    const accountFrom = {
      id: 'acc-1',
      balance: 10000n,
    };
    const accountTo = {
      id: 'acc-2',
      balance: 5000n,
    };

    const mockQueryFrom = { session: mock.fn(async () => accountFrom) };
    const mockQueryTo = { session: mock.fn(async () => accountTo) };

    mockAccountModel.findOne = mock.fn((filter) => {
      if (filter?.userId === actor.id) return Promise.resolve({ id: 'acc-1', userId: actor.id, balance: 10000n });
      if (filter?.id === 'acc-1') return mockQueryFrom;
      return mockQueryTo;
    });

    mockAccountModel.updateOne = mock.fn(async (filter, update) => {
      if (filter?.id === 'acc-1') {
        if (filter?.balance?.$gte && accountFrom.balance < filter.balance.$gte) {
          return { modifiedCount: 0 };
        }
        if (update?.$inc?.balance) {
          accountFrom.balance += update.$inc.balance;
        }
        return { modifiedCount: 1 };
      }
      if (filter?.id === 'acc-2') {
        if (update?.$inc?.balance) {
          accountTo.balance += update.$inc.balance;
        }
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    });

    const result = await newTransfer('acc-1', 'acc-2', 4000, actor, 'idem-test-key', {
      Account: mockAccountModel,
      Transfer: mockTransferModel,
      User: mockUserModel,
      redis: mockRedis
    });

    assert.ok(result.id);
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.from, 'acc-1');
    assert.strictEqual(result.to, 'acc-2');
    assert.strictEqual(result.amount, 4000);
    assert.strictEqual(result.amountMajor, '40.00 USD');
    assert.strictEqual(result.amountMinor, '4000 USDMINOR');
    assert.strictEqual(accountFrom.balance, 6000n);
    assert.strictEqual(accountTo.balance, 9000n);
    assert.strictEqual(mockAccountModel.updateOne.mock.callCount(), 2);
    assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[0].arguments[0], {
      id: 'acc-1',
      balance: { $gte: 4000n }
    });
    assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[0].arguments[1], {
      $inc: { balance: -4000n }
    });
    assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[1].arguments[0], {
      id: 'acc-2'
    });
    assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[1].arguments[1], {
      $inc: { balance: 4000n }
    });
    assert.strictEqual(mockSession.endSession.mock.callCount(), 1);

    // Verify Redis calls: Lock acquired, PENDING set, COMPLETED set, Lock released
    const setCalls = mockRedis.set.mock.calls;
    assert.ok(setCalls.some(c => c.arguments[0].startsWith('lock:') && c.arguments[2]?.NX === true));
    assert.ok(setCalls.some(c => !c.arguments[0].startsWith('lock:') && JSON.parse(c.arguments[1]).status === 'COMPLETED'));
    assert.ok(mockRedis.del.mock.calls.some(c => c.arguments[0].startsWith('lock:')));
  });

  it('getTransferById - should return formatted transfer if found', async () => {
    mockTransferModel.findOne = mock.fn(async () => ({
      id: 'tr-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 10000n,
      status: 'COMPLETED'
    }));

    const result = await getTransferById('tr-1', { Transfer: mockTransferModel });

    assert.strictEqual(mockTransferModel.findOne.mock.callCount(), 1);
    assert.deepStrictEqual(mockTransferModel.findOne.mock.calls[0].arguments, [{ id: 'tr-1' }]);
    assert.strictEqual(result.id, 'tr-1');
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.amount, 10000);
    assert.strictEqual(result.amountMajor, '100.00 USD');
    assert.strictEqual(result.amountMinor, '10000 USDMINOR');
  });

  it('getTransferById - should throw NotFoundError if transfer does not exist', async () => {
    mockTransferModel.findOne = mock.fn(async () => null);

    await assert.rejects(
      getTransferById('non-existent', { Transfer: mockTransferModel }),
      NotFoundError
    );
  });

  it('listTransfers - should return paginated list of formatted transfers', async () => {
    const skipMock = mock.fn();
    const limitMock = mock.fn(async () => [
      { id: 'tr-1', fromAccountId: 'a1', toAccountId: 'a2', amount: 5000n, status: 'COMPLETED' },
      { id: 'tr-2', fromAccountId: 'a2', toAccountId: 'a3', amount: 7500n, status: 'COMPLETED' }
    ]);
    const mockQuery = {
      skip: mock.fn(function (s) {
        skipMock(s);
        return this;
      }),
      limit: limitMock
    };
    mockTransferModel.find = mock.fn(() => mockQuery);

    const result = await listTransfers(1, 10, { Transfer: mockTransferModel });

    assert.strictEqual(skipMock.mock.calls[0].arguments[0], 0);
    assert.strictEqual(limitMock.mock.calls[0].arguments[0], 10);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].amount, 5000);
    assert.strictEqual(result[0].amountMajor, '50.00 USD');
    assert.strictEqual(result[0].amountMinor, '5000 USDMINOR');
    assert.strictEqual(result[0].status, 'COMPLETED');
  });
});
