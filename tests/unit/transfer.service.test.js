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
  BadRequestError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('TransferService', () => {
  let mockAccountModel;
  let mockTransferModel;
  let mockUserModel;
  let mockSession;
  const actor = { id: 'usr-1', email: 'alice@test.com', role: 'user', accountId: 'acc-1' };

  beforeEach(() => {
    mockSession = {
      withTransaction: mock.fn(async (cb) => await cb()),
      endSession: mock.fn(async () => undefined)
    };

    mock.method(mongoose, 'startSession', async () => mockSession);

    mockAccountModel = {
      findOne: mock.fn()
    };

    mockUserModel = {
      findOne: mock.fn(async () => ({ id: actor.id, accountId: 'acc-1' }))
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
  });

  afterEach(() => {
    mock.reset();
  });

  it('newTransfer - should throw UnauthorizedError if actor is missing', async () => {
    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 50, undefined, {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel
      }),
      UnauthorizedError
    );

    assert.strictEqual(mockUserModel.findOne.mock.callCount(), 0);
    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw UnauthorizedError if authenticated user is not found', async () => {
    mockUserModel.findOne = mock.fn(async () => null);

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 50, actor, {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel
      }),
      UnauthorizedError
    );

    assert.strictEqual(mockUserModel.findOne.mock.callCount(), 1);
    assert.deepStrictEqual(mockUserModel.findOne.mock.calls[0].arguments, [{ id: actor.id }]);
    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw ForbiddenError if fromAccountId is not the authenticated user account', async () => {
    await assert.rejects(
      newTransfer('acc-someone-else', 'acc-2', 50, actor, {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel
      }),
      ForbiddenError
    );

    assert.strictEqual(mockUserModel.findOne.mock.callCount(), 1);
    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
    assert.strictEqual(mockAccountModel.findOne.mock.callCount(), 0);
  });

  it('newTransfer - should not trust a spoofed actor.accountId over the persisted user account', async () => {
    const spoofedActor = { ...actor, accountId: 'acc-spoofed' };

    await assert.rejects(
      newTransfer('acc-spoofed', 'acc-2', 50, spoofedActor, {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel
      }),
      ForbiddenError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw BadRequestError if source and destination accounts are the same', async () => {
    await assert.rejects(
      newTransfer('acc-1', 'acc-1', 50, actor, {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel
      }),
      BadRequestError
    );

    assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
  });

  it('newTransfer - should throw NotFoundError if sender account does not exist', async () => {
    const mockQueryFrom = { session: mock.fn(async () => null) };
    const mockQueryTo = { session: mock.fn(async () => ({ id: 'acc-2', balance: '100' })) };

    mockAccountModel.findOne = mock.fn((filter) => {
      if (filter?.id === 'acc-1') return mockQueryFrom;
      return mockQueryTo;
    });

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 50, actor, {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel
      }),
      NotFoundError
    );

    assert.strictEqual(mockSession.endSession.mock.callCount(), 1);
  });

  it('newTransfer - should throw InsufficientFundsError if sender balance is less than transfer amount', async () => {
    const accountFrom = {
      id: 'acc-1',
      balance: '30',
      save: mock.fn(async () => true)
    };
    const accountTo = {
      id: 'acc-2',
      balance: '100',
      save: mock.fn(async () => true)
    };

    const mockQueryFrom = { session: mock.fn(async () => accountFrom) };
    const mockQueryTo = { session: mock.fn(async () => accountTo) };

    mockAccountModel.findOne = mock.fn((filter) => {
      if (filter?.id === 'acc-1') return mockQueryFrom;
      return mockQueryTo;
    });

    await assert.rejects(
      newTransfer('acc-1', 'acc-2', 50, actor, {
        Account: mockAccountModel,
        Transfer: mockTransferModel,
        User: mockUserModel
      }),
      InsufficientFundsError
    );

    assert.strictEqual(mockSession.endSession.mock.callCount(), 1);
  });

  it('newTransfer - should complete transfer, update balances, and return formatted response with status COMPLETED', async () => {
    const saveFromMock = mock.fn(async () => true);
    const saveToMock = mock.fn(async () => true);
    const accountFrom = {
      id: 'acc-1',
      balance: '100',
      save: saveFromMock
    };
    const accountTo = {
      id: 'acc-2',
      balance: '50',
      save: saveToMock
    };

    const mockQueryFrom = { session: mock.fn(async () => accountFrom) };
    const mockQueryTo = { session: mock.fn(async () => accountTo) };

    mockAccountModel.findOne = mock.fn((filter) => {
      if (filter?.id === 'acc-1') return mockQueryFrom;
      return mockQueryTo;
    });

    const result = await newTransfer('acc-1', 'acc-2', 40, actor, {
      Account: mockAccountModel,
      Transfer: mockTransferModel,
      User: mockUserModel
    });

    assert.ok(result.id);
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.from, 'acc-1');
    assert.strictEqual(result.to, 'acc-2');
    assert.strictEqual(result.amount, 40);
    assert.strictEqual(saveFromMock.mock.callCount(), 1);
    assert.strictEqual(saveToMock.mock.callCount(), 1);
    assert.strictEqual(mockSession.endSession.mock.callCount(), 1);
    assert.deepStrictEqual(mockUserModel.findOne.mock.calls[0].arguments, [{ id: actor.id }]);
  });

  it('getTransferById - should return formatted transfer if found', async () => {
    mockTransferModel.findOne = mock.fn(async () => ({
      id: 'tr-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: '100',
      status: 'COMPLETED'
    }));

    const result = await getTransferById('tr-1', { Transfer: mockTransferModel });

    assert.strictEqual(mockTransferModel.findOne.mock.callCount(), 1);
    assert.deepStrictEqual(mockTransferModel.findOne.mock.calls[0].arguments, [{ id: 'tr-1' }]);
    assert.strictEqual(result.id, 'tr-1');
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.amount, 100);
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
      { id: 'tr-1', fromAccountId: 'a1', toAccountId: 'a2', amount: '50', status: 'COMPLETED' },
      { id: 'tr-2', fromAccountId: 'a2', toAccountId: 'a3', amount: '75', status: 'COMPLETED' }
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
    assert.strictEqual(result[0].amount, 50);
    assert.strictEqual(result[0].status, 'COMPLETED');
  });
});
