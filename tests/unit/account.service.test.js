import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccount,
  fetchAccounts,
  getAccountById,
  editAccount,
  removeAccount
} from '../../services/account.js';
import {
  DuplicateAccountError,
  NotFoundError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('Account Service Unit Tests (Mock Models)', () => {
  let mockAccountModel;

  beforeEach(() => {
    mockAccountModel = {
      findOne: mock.fn(),
      create: mock.fn(),
      find: mock.fn(),
      findOneAndUpdate: mock.fn(),
      findOneAndDelete: mock.fn()
    };
  });

  describe('createAccount', () => {
    it('should create an account when email is not duplicate', async () => {
      mockAccountModel.findOne = mock.fn(async () => null);
      mockAccountModel.create = mock.fn(async () => ({
        id: 'acc-123',
        name: 'Jane Doe',
        email: 'jane@example.com',
        balance: 500
      }));

      const result = await createAccount(
        'Jane Doe',
        'jane@example.com',
        500,
        { Account: mockAccountModel }
      );

      assert.strictEqual(mockAccountModel.findOne.mock.callCount(), 1);
      assert.deepStrictEqual(mockAccountModel.findOne.mock.calls[0].arguments, [{ email: 'jane@example.com' }]);
      assert.strictEqual(mockAccountModel.create.mock.callCount(), 1);
      const createdArg = mockAccountModel.create.mock.calls[0].arguments[0];
      assert.strictEqual(createdArg.name, 'Jane Doe');
      assert.strictEqual(createdArg.email, 'jane@example.com');
      assert.strictEqual(createdArg.balance, 500);

      assert.deepStrictEqual(result, {
        id: 'acc-123',
        name: 'Jane Doe',
        email: 'jane@example.com',
        balance: 500
      });
    });

    it('should throw DuplicateAccountError when email already exists', async () => {
      mockAccountModel.findOne = mock.fn(async () => ({ id: 'existing-id', email: 'jane@example.com' }));
      mockAccountModel.create = mock.fn();

      await assert.rejects(
        createAccount('Jane Doe', 'jane@example.com', 500, { Account: mockAccountModel }),
        DuplicateAccountError
      );

      assert.strictEqual(mockAccountModel.create.mock.callCount(), 0);
    });
  });

  describe('fetchAccounts', () => {
    it('should fetch paginated accounts and format them', async () => {
      const skipMock = mock.fn();
      const limitMock = mock.fn(async () => [
        { id: '1', name: 'User 1', email: 'u1@test.com', balance: 100 },
        { id: '2', name: 'User 2', email: 'u2@test.com', balance: 200 }
      ]);
      const mockQuery = {
        skip: mock.fn(function (s) {
          skipMock(s);
          return this;
        }),
        limit: limitMock
      };
      mockAccountModel.find = mock.fn(() => mockQuery);

      const result = await fetchAccounts(1, 10, { Account: mockAccountModel });

      assert.strictEqual(mockAccountModel.find.mock.callCount(), 1);
      assert.strictEqual(skipMock.mock.calls[0].arguments[0], 0);
      assert.strictEqual(limitMock.mock.calls[0].arguments[0], 10);
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], { id: '1', name: 'User 1', email: 'u1@test.com', balance: 100 });
    });
  });

  describe('getAccountById', () => {
    it('should return account response when account exists', async () => {
      mockAccountModel.findOne = mock.fn(async () => ({
        id: 'acc-1',
        name: 'Alice',
        email: 'alice@example.com',
        balance: 300
      }));

      const result = await getAccountById('acc-1', { Account: mockAccountModel });

      assert.strictEqual(mockAccountModel.findOne.mock.callCount(), 1);
      assert.deepStrictEqual(mockAccountModel.findOne.mock.calls[0].arguments, [{ id: 'acc-1' }]);
      assert.deepStrictEqual(result, {
        id: 'acc-1',
        name: 'Alice',
        email: 'alice@example.com',
        balance: 300
      });
    });

    it('should throw NotFoundError when account does not exist', async () => {
      mockAccountModel.findOne = mock.fn(async () => null);

      await assert.rejects(
        getAccountById('non-existent', { Account: mockAccountModel }),
        NotFoundError
      );
    });
  });

  describe('editAccount', () => {
    it('should update and return formatted account', async () => {
      mockAccountModel.findOneAndUpdate = mock.fn(async () => ({
        id: 'acc-1',
        name: 'Alice Updated',
        email: 'alice@example.com',
        balance: 400
      }));

      const result = await editAccount('acc-1', 'Alice Updated', 'alice@example.com', 400, {
        Account: mockAccountModel
      });

      assert.strictEqual(mockAccountModel.findOneAndUpdate.mock.callCount(), 1);
      assert.deepStrictEqual(mockAccountModel.findOneAndUpdate.mock.calls[0].arguments, [
        { id: 'acc-1' },
        { name: 'Alice Updated', email: 'alice@example.com', balance: 400 },
        { new: true }
      ]);
      assert.strictEqual(result.name, 'Alice Updated');
      assert.strictEqual(result.balance, 400);
    });

    it('should throw NotFoundError if account to edit is not found', async () => {
      mockAccountModel.findOneAndUpdate = mock.fn(async () => null);

      await assert.rejects(
        editAccount('non-existent', 'Name', 'email@test.com', 100, { Account: mockAccountModel }),
        NotFoundError
      );
    });
  });

  describe('removeAccount', () => {
    it('should delete and return account response', async () => {
      mockAccountModel.findOneAndDelete = mock.fn(async () => ({
        id: 'acc-1',
        name: 'Alice',
        email: 'alice@example.com',
        balance: 100
      }));

      const result = await removeAccount('acc-1', { Account: mockAccountModel });

      assert.strictEqual(mockAccountModel.findOneAndDelete.mock.callCount(), 1);
      assert.deepStrictEqual(mockAccountModel.findOneAndDelete.mock.calls[0].arguments, [{ id: 'acc-1' }]);
      assert.strictEqual(result.id, 'acc-1');
    });

    it('should throw NotFoundError if account to delete is not found', async () => {
      mockAccountModel.findOneAndDelete = mock.fn(async () => null);

      await assert.rejects(
        removeAccount('non-existent', { Account: mockAccountModel }),
        NotFoundError
      );
    });
  });
});
