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

describe('AccountService', () => {
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

  it('createAccount - should create an account when email is not duplicate', async () => {
    mockAccountModel.findOne = mock.fn(async () => null);
    mockAccountModel.create = mock.fn(async () => ({
      id: 'acc-123',
      name: 'Jane Doe',
      email: 'jane@example.com',
      balance: 50000n
    }));

    const result = await createAccount(
      'Jane Doe',
      'jane@example.com',
      50000,
      { Account: mockAccountModel }
    );

    assert.strictEqual(mockAccountModel.findOne.mock.callCount(), 1);
    assert.deepStrictEqual(mockAccountModel.findOne.mock.calls[0].arguments, [{ email: 'jane@example.com' }]);
    assert.strictEqual(mockAccountModel.create.mock.callCount(), 1);
    const createdArg = mockAccountModel.create.mock.calls[0].arguments[0];
    assert.strictEqual(createdArg.name, 'Jane Doe');
    assert.strictEqual(createdArg.email, 'jane@example.com');
    assert.strictEqual(createdArg.balance, 50000);

    assert.deepStrictEqual(result, {
      id: 'acc-123',
      name: 'Jane Doe',
      email: 'jane@example.com',
      balance: '500.00 USD',
      balanceMinor: '50000 USDMINOR'
    });
  });

  it('createAccount - should throw DuplicateAccountError when email already exists', async () => {
    mockAccountModel.findOne = mock.fn(async () => ({ id: 'existing-id', email: 'jane@example.com' }));
    mockAccountModel.create = mock.fn();

    await assert.rejects(
      createAccount('Jane Doe', 'jane@example.com', 50000, { Account: mockAccountModel }),
      DuplicateAccountError
    );

    assert.strictEqual(mockAccountModel.create.mock.callCount(), 0);
  });

  it('fetchAccounts - should fetch paginated accounts and format them', async () => {
    const skipMock = mock.fn();
    const limitMock = mock.fn(async () => [
      { id: '1', name: 'User 1', email: 'u1@test.com', balance: 10000n },
      { id: '2', name: 'User 2', email: 'u2@test.com', balance: 20000n }
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
    assert.deepStrictEqual(result[0], {
      id: '1',
      name: 'User 1',
      email: 'u1@test.com',
      balance: '100.00 USD',
      balanceMinor: '10000 USDMINOR'
    });
  });

  it('getAccountById - should return account response when account exists', async () => {
    mockAccountModel.findOne = mock.fn(async () => ({
      id: 'acc-1',
      name: 'Alice',
      email: 'alice@example.com',
      balance: 30000n
    }));

    const result = await getAccountById('acc-1', { Account: mockAccountModel });

    assert.strictEqual(mockAccountModel.findOne.mock.callCount(), 1);
    assert.deepStrictEqual(mockAccountModel.findOne.mock.calls[0].arguments, [{ id: 'acc-1' }]);
    assert.deepStrictEqual(result, {
      id: 'acc-1',
      name: 'Alice',
      email: 'alice@example.com',
      balance: '300.00 USD',
      balanceMinor: '30000 USDMINOR'
    });
  });

  it('getAccountById - should throw NotFoundError when account does not exist', async () => {
    mockAccountModel.findOne = mock.fn(async () => null);

    await assert.rejects(
      getAccountById('non-existent', { Account: mockAccountModel }),
      NotFoundError
    );
  });

  it('editAccount - should update and return formatted account', async () => {
    mockAccountModel.findOneAndUpdate = mock.fn(async () => ({
      id: 'acc-1',
      name: 'Alice Updated',
      email: 'alice@example.com',
      balance: 40000n
    }));

    const result = await editAccount('acc-1', 'Alice Updated', 'alice@example.com', 40000, {
      Account: mockAccountModel
    });

    assert.strictEqual(mockAccountModel.findOneAndUpdate.mock.callCount(), 1);
    assert.deepStrictEqual(mockAccountModel.findOneAndUpdate.mock.calls[0].arguments, [
      { id: 'acc-1' },
      { name: 'Alice Updated', email: 'alice@example.com', balance: 40000 },
      { new: true }
    ]);
    assert.strictEqual(result.name, 'Alice Updated');
    assert.strictEqual(result.balance, '400.00 USD');
    assert.strictEqual(result.balanceMinor, '40000 USDMINOR');
  });

  it('editAccount - should throw NotFoundError if account to edit is not found', async () => {
    mockAccountModel.findOneAndUpdate = mock.fn(async () => null);

    await assert.rejects(
      editAccount('non-existent', 'Name', 'email@test.com', 10000, { Account: mockAccountModel }),
      NotFoundError
    );
  });

  it('removeAccount - should delete and return account response', async () => {
    mockAccountModel.findOneAndDelete = mock.fn(async () => ({
      id: 'acc-1',
      name: 'Alice',
      email: 'alice@example.com',
      balance: 10000n
    }));

    const result = await removeAccount('acc-1', { Account: mockAccountModel });

    assert.strictEqual(mockAccountModel.findOneAndDelete.mock.callCount(), 1);
    assert.deepStrictEqual(mockAccountModel.findOneAndDelete.mock.calls[0].arguments, [{ id: 'acc-1' }]);
    assert.strictEqual(result.id, 'acc-1');
    assert.strictEqual(result.balance, '100.00 USD');
    assert.strictEqual(result.balanceMinor, '10000 USDMINOR');
  });

  it('removeAccount - should throw NotFoundError if account to delete is not found', async () => {
    mockAccountModel.findOneAndDelete = mock.fn(async () => null);

    await assert.rejects(
      removeAccount('non-existent', { Account: mockAccountModel }),
      NotFoundError
    );
  });
});
