import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountHandler, getAccountHandler } from '../../controllers/account.js';
import { createTransferHandler, getTransferHandler } from '../../controllers/transfer.js';

describe('Controller Handlers Unit Tests (Dependency Injected Services)', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {}
    };
    mockRes = {
      status: mock.fn(function () { return this; }),
      json: mock.fn(function () { return this; })
    };
  });

  describe('createAccountHandler', () => {
    it('should invoke injected service and return 201 with created account', async () => {
      mockReq.body = { name: 'Bob', email: 'bob@test.com', balance: 250 };
      const mockNewAccount = mock.fn(async () => ({
        id: 'acc-bob',
        name: 'Bob',
        email: 'bob@test.com',
        balance: 250
      }));

      const handler = createAccountHandler({ newAccount: mockNewAccount });
      await handler(mockReq, mockRes);

      assert.strictEqual(mockNewAccount.mock.callCount(), 1);
      assert.deepStrictEqual(mockNewAccount.mock.calls[0].arguments, ['Bob', 'bob@test.com', 250]);
      assert.strictEqual(mockRes.status.mock.callCount(), 1);
      assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [201]);
      assert.strictEqual(mockRes.json.mock.callCount(), 1);
      assert.deepStrictEqual(mockRes.json.mock.calls[0].arguments, [{
        id: 'acc-bob',
        name: 'Bob',
        email: 'bob@test.com',
        balance: 250
      }]);
    });
  });

  describe('getAccountHandler', () => {
    it('should invoke injected service with param id and return 200', async () => {
      mockReq.params = { id: 'acc-123' };
      const mockGetAccount = mock.fn(async () => ({
        id: 'acc-123',
        name: 'Alice',
        email: 'alice@test.com',
        balance: 100
      }));

      const handler = getAccountHandler({ getAccountById: mockGetAccount });
      await handler(mockReq, mockRes);

      assert.strictEqual(mockGetAccount.mock.callCount(), 1);
      assert.deepStrictEqual(mockGetAccount.mock.calls[0].arguments, ['acc-123']);
      assert.strictEqual(mockRes.status.mock.callCount(), 1);
      assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
      assert.strictEqual(mockRes.json.mock.callCount(), 1);
      assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].id, 'acc-123');
    });
  });

  describe('createTransferHandler', () => {
    it('should invoke injected service and return 201 with transfer result', async () => {
      mockReq.body = { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 50 };
      const mockNewTransfer = mock.fn(async () => ({
        id: 'tr-1',
        from: 'acc-1',
        to: 'acc-2',
        amount: 50,
        status: 'COMPLETED'
      }));

      const handler = createTransferHandler({ newTransfer: mockNewTransfer });
      await handler(mockReq, mockRes);

      assert.strictEqual(mockNewTransfer.mock.callCount(), 1);
      assert.deepStrictEqual(mockNewTransfer.mock.calls[0].arguments, ['acc-1', 'acc-2', 50]);
      assert.strictEqual(mockRes.status.mock.callCount(), 1);
      assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [201]);
      assert.strictEqual(mockRes.json.mock.callCount(), 1);
      assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].status, 'COMPLETED');
    });
  });

  describe('getTransferHandler', () => {
    it('should invoke injected service with param id and return 200', async () => {
      mockReq.params = { id: 'tr-999' };
      const mockGetTransfer = mock.fn(async () => ({
        id: 'tr-999',
        status: 'COMPLETED',
        amount: 100
      }));

      const handler = getTransferHandler({ getTransferById: mockGetTransfer });
      await handler(mockReq, mockRes);

      assert.strictEqual(mockGetTransfer.mock.callCount(), 1);
      assert.deepStrictEqual(mockGetTransfer.mock.calls[0].arguments, ['tr-999']);
      assert.strictEqual(mockRes.status.mock.callCount(), 1);
      assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
      assert.strictEqual(mockRes.json.mock.callCount(), 1);
      assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].id, 'tr-999');
    });
  });
});
