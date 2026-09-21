import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { provisionVirtualAccount } from '../../services/virtualAccount.js';
import {
    BadRequestError,
    NotFoundError,
    ForbiddenError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('VirtualAccount Service', () => {
    it('should throw BadRequestError if userId is missing', async () => {
        await assert.rejects(provisionVirtualAccount('', 'acc-1'), BadRequestError);
    });

    it('should throw BadRequestError if accountId is missing', async () => {
        await assert.rejects(provisionVirtualAccount('usr-1', ''), BadRequestError);
    });

    it('should throw NotFoundError if user is not found', async () => {
        const mockUserModel = {
            findOne: mock.fn(async () => null)
        };
        const mockAccountModel = {
            findOne: mock.fn(async () => ({ id: 'acc-1', userId: 'usr-1' }))
        };

        await assert.rejects(
            provisionVirtualAccount('usr-1', 'acc-1', 'test-bank', {
                User: mockUserModel,
                Account: mockAccountModel
            }),
            NotFoundError
        );
    });

    it('should throw NotFoundError if account is not found', async () => {
        const mockUserModel = {
            findOne: mock.fn(async () => ({ id: 'usr-1', name: 'Alice', email: 'alice@example.com' }))
        };
        const mockAccountModel = {
            findOne: mock.fn(async () => null)
        };

        await assert.rejects(
            provisionVirtualAccount('usr-1', 'acc-1', 'test-bank', {
                User: mockUserModel,
                Account: mockAccountModel
            }),
            NotFoundError
        );
    });

    it('should throw ForbiddenError if account does not belong to user', async () => {
        const mockUserModel = {
            findOne: mock.fn(async () => ({ id: 'usr-1', name: 'Alice', email: 'alice@example.com' }))
        };
        const mockAccountModel = {
            findOne: mock.fn(async () => ({ id: 'acc-1', userId: 'usr-someone-else' }))
        };

        await assert.rejects(
            provisionVirtualAccount('usr-1', 'acc-1', 'test-bank', {
                User: mockUserModel,
                Account: mockAccountModel
            }),
            ForbiddenError
        );
    });

    it('should create customer, save customerCode, and provision DVA when user has no customerCode', async () => {
        const userSaveMock = mock.fn(async () => true);
        const accountSaveMock = mock.fn(async () => true);

        const mockUser = {
            id: 'usr-1',
            name: 'Alice Jane Doe',
            email: 'alice@example.com',
            customerCode: null,
            save: userSaveMock
        };

        const mockAccount = {
            id: 'acc-1',
            userId: 'usr-1',
            accountNumber: null,
            virtualAccount: null,
            save: accountSaveMock
        };

        const mockUserModel = {
            findOne: mock.fn(async () => mockUser)
        };
        const mockAccountModel = {
            findOne: mock.fn(async () => mockAccount)
        };

        const mockGateway = {
            splitName: mock.fn((name) => ({ firstName: 'Alice', lastName: 'Jane Doe' })),
            getOrCreateCustomer: mock.fn(async () => ({ customer_code: 'CUS_mock_created_123' })),
            createDedicatedAccount: mock.fn(async (custCode, prefBank) => ({
                id: 555,
                account_number: '9988776655',
                account_name: 'Alice Jane Doe',
                bank: { name: 'Test Bank', id: 1 }
            }))
        };

        const result = await provisionVirtualAccount('usr-1', 'acc-1', 'test-bank', {
            User: mockUserModel,
            Account: mockAccountModel,
            gateway: mockGateway
        });

        // Assert customer was resolved and saved on user
        assert.strictEqual(mockGateway.getOrCreateCustomer.mock.callCount(), 1);
        assert.strictEqual(mockUser.customerCode, 'CUS_mock_created_123');
        assert.strictEqual(userSaveMock.mock.callCount(), 1);

        // Assert DVA was requested and saved on account
        assert.strictEqual(mockGateway.createDedicatedAccount.mock.callCount(), 1);
        assert.deepStrictEqual(mockGateway.createDedicatedAccount.mock.calls[0].arguments, ['CUS_mock_created_123', 'test-bank']);
        assert.strictEqual(mockAccount.accountNumber, '9988776655');
        assert.strictEqual(mockAccount.virtualAccount.accountNumber, '9988776655');
        assert.strictEqual(mockAccount.virtualAccount.bankName, 'Test Bank');
        assert.strictEqual(mockAccount.virtualAccount.assigned, true);
        assert.strictEqual(accountSaveMock.mock.callCount(), 1);
        assert.strictEqual(result, mockAccount);
    });

    it('should reuse existing user.customerCode without calling getOrCreateCustomer', async () => {
        const userSaveMock = mock.fn(async () => true);
        const accountSaveMock = mock.fn(async () => true);

        const mockUser = {
            id: 'usr-2',
            name: 'Bob Smith',
            email: 'bob@example.com',
            customerCode: 'CUS_already_exists_789',
            save: userSaveMock
        };

        const mockAccount = {
            id: 'acc-2',
            userId: 'usr-2',
            accountNumber: null,
            virtualAccount: null,
            save: accountSaveMock
        };

        const mockUserModel = {
            findOne: mock.fn(async () => mockUser)
        };
        const mockAccountModel = {
            findOne: mock.fn(async () => mockAccount)
        };

        const mockGateway = {
            splitName: mock.fn(),
            getOrCreateCustomer: mock.fn(),
            createDedicatedAccount: mock.fn(async () => ({
                id: 777,
                account_number: '1122334455',
                account_name: 'Bob Smith',
                bank: { name: 'Test Bank', id: 2 }
            }))
        };

        const result = await provisionVirtualAccount('usr-2', 'acc-2', 'test-bank', {
            User: mockUserModel,
            Account: mockAccountModel,
            gateway: mockGateway
        });

        // Customer creation should NOT be called
        assert.strictEqual(mockGateway.getOrCreateCustomer.mock.callCount(), 0);
        assert.strictEqual(userSaveMock.mock.callCount(), 0);

        // DVA creation should be called with existing customerCode
        assert.strictEqual(mockGateway.createDedicatedAccount.mock.callCount(), 1);
        assert.deepStrictEqual(mockGateway.createDedicatedAccount.mock.calls[0].arguments, ['CUS_already_exists_789', 'test-bank']);
        assert.strictEqual(mockAccount.accountNumber, '1122334455');
        assert.strictEqual(mockAccount.virtualAccount.assigned, true);
        assert.strictEqual(accountSaveMock.mock.callCount(), 1);
    });
});
