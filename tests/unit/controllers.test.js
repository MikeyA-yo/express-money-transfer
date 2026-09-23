import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccountHandler,
  getAccountHandler,
  getAccountsHandler,
  updateAccountHandler,
  deleteAccountHandler
} from '../../controllers/account.js';
import {
  createTransferHandler,
  getTransferHandler,
  getTransfersHandler
} from '../../controllers/transfer.js';
import {
  signupHandler,
  loginHandler,
  getProfileHandler,
  issueTokenHandler
} from '../../controllers/auth.js';
import { BadRequestError } from '../../common/domain-exceptions/domain-exceptions.js';

describe('AccountController', () => {
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

  it('createAccount - should invoke injected service with name, email, balance, userId and return 201 with created account', async () => {
    mockReq.body = { name: 'Bob', email: 'bob@test.com', balance: 25000, userId: 'usr-bob-1' };
    const mockNewAccount = mock.fn(async () => ({
      id: 'acc-bob',
      name: 'Bob',
      email: 'bob@test.com',
      balance: '250.00 USD',
      balanceMinor: '25000 USDMINOR'
    }));

    const handler = createAccountHandler({ newAccount: mockNewAccount });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockNewAccount.mock.callCount(), 1);
    assert.deepStrictEqual(mockNewAccount.mock.calls[0].arguments, ['Bob', 'bob@test.com', 25000, 'usr-bob-1']);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [201]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.json.mock.calls[0].arguments, [{
      id: 'acc-bob',
      name: 'Bob',
      email: 'bob@test.com',
      balance: '250.00 USD',
      balanceMinor: '25000 USDMINOR'
    }]);
  });

  it('getAccount - should invoke injected service with param id and return 200', async () => {
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

  it('getAccounts - should invoke injected service with pagination and return 200', async () => {
    mockReq.query = { page: 1, limit: 10 };
    const mockFetchAccounts = mock.fn(async () => [
      { id: 'acc-1', name: 'User 1' },
      { id: 'acc-2', name: 'User 2' }
    ]);

    const handler = getAccountsHandler({ fetchAccounts: mockFetchAccounts });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockFetchAccounts.mock.callCount(), 1);
    assert.deepStrictEqual(mockFetchAccounts.mock.calls[0].arguments, [1, 10]);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].length, 2);
  });

  it('updateAccount - should invoke injected service and return 200 with updated account', async () => {
    mockReq.params = { id: 'acc-123' };
    mockReq.body = { name: 'Alice New', email: 'alice@new.com', balance: 500 };
    const mockEditAccount = mock.fn(async () => ({
      id: 'acc-123',
      name: 'Alice New',
      email: 'alice@new.com',
      balance: 500
    }));

    const handler = updateAccountHandler({ editAccount: mockEditAccount });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockEditAccount.mock.callCount(), 1);
    assert.deepStrictEqual(mockEditAccount.mock.calls[0].arguments, ['acc-123', 'Alice New', 'alice@new.com', 500]);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].name, 'Alice New');
  });

  it('deleteAccount - should invoke injected service and return 200 with success message', async () => {
    mockReq.params = { id: 'acc-123' };
    const mockRemoveAccount = mock.fn(async () => ({ id: 'acc-123' }));

    const handler = deleteAccountHandler({ removeAccount: mockRemoveAccount });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockRemoveAccount.mock.callCount(), 1);
    assert.deepStrictEqual(mockRemoveAccount.mock.calls[0].arguments, ['acc-123']);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.json.mock.calls[0].arguments[0], {
      message: 'Account deleted successfully'
    });
  });
});

describe('TransferController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: { id: 'usr-1', email: 'alice@test.com', role: 'user', accountId: 'acc-1' }
    };
    mockRes = {
      status: mock.fn(function () { return this; }),
      json: mock.fn(function () { return this; })
    };
  });

  it('createTransfer - should invoke injected service with authenticated actor and return 201 with transfer result', async () => {
    mockReq.headers = { 'x-idempotency-key': 'idem-key-1' };
    mockReq.body = { fromAccountId: 'acc-1', toAccountId: 'acc-2', amountMinor: 5000 };
    const mockNewTransfer = mock.fn(async () => ({
      id: 'tr-1',
      from: 'acc-1',
      to: 'acc-2',
      amount: 5000,
      amountMajor: '50.00 USD',
      amountMinor: '5000 USDMINOR',
      status: 'COMPLETED'
    }));

    const handler = createTransferHandler({ newTransfer: mockNewTransfer });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockNewTransfer.mock.callCount(), 1);
    assert.deepStrictEqual(mockNewTransfer.mock.calls[0].arguments, ['acc-1', 'acc-2', 5000, mockReq.user, 'idem-key-1']);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [201]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].status, 'COMPLETED');
  });

  it('createTransfer - should throw BadRequestError when X-Idempotency-Key header is missing', async () => {
    mockReq.headers = {};
    mockReq.body = { fromAccountId: 'acc-1', toAccountId: 'acc-2', amountMinor: 5000 };
    const handler = createTransferHandler();

    await assert.rejects(
      () => handler(mockReq, mockRes),
      BadRequestError
    );
  });

  it('getTransfer - should invoke injected service with param id and return 200', async () => {
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

  it('getTransfers - should invoke injected service with pagination and return 200', async () => {
    mockReq.query = { page: 1, limit: 10 };
    const mockListTransfers = mock.fn(async () => [
      { id: 'tr-1', amount: 50 },
      { id: 'tr-2', amount: 75 }
    ]);

    const handler = getTransfersHandler({ listTransfers: mockListTransfers });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockListTransfers.mock.callCount(), 1);
    assert.deepStrictEqual(mockListTransfers.mock.calls[0].arguments, [1, 10]);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].length, 2);
  });
});

describe('AuthController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: {}
    };
    mockRes = {
      status: mock.fn(function () { return this; }),
      json: mock.fn(function () { return this; })
    };
  });

  it('signup - should invoke signup service and return 201 with token and user', async () => {
    mockReq.body = { name: 'Alice', email: 'alice@test.com', password: 'pwd', balance: 500 };
    const mockSignup = mock.fn(async () => ({
      token: 'jwt-token-123',
      user: { id: 'usr-1', email: 'alice@test.com', role: 'user' },
      account: { id: 'acc-1', balance: 500 }
    }));

    const handler = signupHandler({ signup: mockSignup });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockSignup.mock.callCount(), 1);
    assert.deepStrictEqual(mockSignup.mock.calls[0].arguments, [{
      name: 'Alice',
      email: 'alice@test.com',
      password: 'pwd',
      initialBalance: 500
    }]);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [201]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].token, 'jwt-token-123');
  });

  it('login - should invoke login service and return 200 with token and user', async () => {
    mockReq.body = { email: 'alice@test.com', password: 'pwd', role: 'user' };
    const mockLogin = mock.fn(async () => ({
      token: 'jwt-token-456',
      user: { id: 'usr-1', email: 'alice@test.com', role: 'user' }
    }));

    const handler = loginHandler({ login: mockLogin });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockLogin.mock.callCount(), 1);
    assert.deepStrictEqual(mockLogin.mock.calls[0].arguments, [{
      email: 'alice@test.com',
      password: 'pwd',
      role: 'user'
    }]);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].token, 'jwt-token-456');
  });

  it('getProfile - should invoke getProfile with req.user and return 200', async () => {
    mockReq.user = { id: 'usr-1', email: 'alice@test.com', role: 'user' };
    const mockGetProfile = mock.fn(async () => ({
      id: 'usr-1',
      name: 'Alice',
      email: 'alice@test.com',
      role: 'user'
    }));

    const handler = getProfileHandler({ getProfile: mockGetProfile });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockGetProfile.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetProfile.mock.calls[0].arguments, [mockReq.user]);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.json.mock.calls[0].arguments[0], {
      user: { id: 'usr-1', name: 'Alice', email: 'alice@test.com', role: 'user' }
    });
  });

  it('issueToken - should generate token and return 200 with token payload', async () => {
    mockReq.body = { email: 'alice@test.com', role: 'user', id: 'usr-custom' };
    const mockGenerateToken = mock.fn(() => 'jwt-token-custom');

    const handler = issueTokenHandler({ generateToken: mockGenerateToken });
    await handler(mockReq, mockRes);

    assert.strictEqual(mockGenerateToken.mock.callCount(), 1);
    assert.strictEqual(mockRes.status.mock.callCount(), 1);
    assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
    assert.strictEqual(mockRes.json.mock.callCount(), 1);
    assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].token, 'jwt-token-custom');
  });
});
