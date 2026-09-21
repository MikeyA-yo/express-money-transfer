import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
    splitName,
    createCustomer,
    fetchCustomer,
    getOrCreateCustomer,
    createDedicatedAccount,
    fetchDedicatedAccount
} from '../../gateways/paystack/account.js';
import {
    BadRequestError,
    NotFoundError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('Paystack Gateway', () => {
    describe('splitName', () => {
        it('should split two-part names accurately', () => {
            const result = splitName('Alice Doe');
            assert.deepStrictEqual(result, { firstName: 'Alice', lastName: 'Doe' });
        });

        it('should handle multi-part names accurately', () => {
            const result = splitName('Ayomide Victor Oluwatola');
            assert.deepStrictEqual(result, { firstName: 'Ayomide', lastName: 'Victor Oluwatola' });
        });

        it('should handle single-word names with fallback', () => {
            const result = splitName('Cher');
            assert.deepStrictEqual(result, { firstName: 'Cher', lastName: 'Cher' });
        });

        it('should handle empty or whitespace names gracefully', () => {
            const result = splitName('');
            assert.deepStrictEqual(result, { firstName: 'Customer', lastName: 'User' });
        });
    });

    describe('createCustomer', () => {
        it('should throw BadRequestError when required arguments are missing', async () => {
            await assert.rejects(createCustomer('', 'First', 'Last'), BadRequestError);
            await assert.rejects(createCustomer('test@example.com', '', 'Last'), BadRequestError);
            await assert.rejects(createCustomer('test@example.com', 'First', ''), BadRequestError);
        });

        it('should successfully create and return customer data', async () => {
            const mockClient = {
                customer: {
                    create: mock.fn(async (payload) => ({
                        status: true,
                        message: 'Customer created',
                        data: {
                            id: 123,
                            email: payload.email,
                            first_name: payload.first_name,
                            last_name: payload.last_name,
                            customer_code: 'CUS_mock_123'
                        }
                    }))
                }
            };

            const res = await createCustomer('alice@example.com', 'Alice', 'Doe', null, { client: mockClient });
            assert.strictEqual(res.customer_code, 'CUS_mock_123');
            assert.strictEqual(mockClient.customer.create.mock.callCount(), 1);
            assert.deepStrictEqual(mockClient.customer.create.mock.calls[0].arguments[0], {
                email: 'alice@example.com',
                first_name: 'Alice',
                last_name: 'Doe'
            });
        });
    });

    describe('fetchCustomer', () => {
        it('should throw BadRequestError if emailOrCode is missing', async () => {
            await assert.rejects(fetchCustomer(''), BadRequestError);
        });

        it('should fetch customer by email or code', async () => {
            const mockClient = {
                customer: {
                    fetch: mock.fn(async (param) => ({
                        status: true,
                        data: { customer_code: 'CUS_existing_123', email: param }
                    }))
                }
            };

            const res = await fetchCustomer('alice@example.com', { client: mockClient });
            assert.strictEqual(res.customer_code, 'CUS_existing_123');
            assert.strictEqual(mockClient.customer.fetch.mock.callCount(), 1);
        });

        it('should throw NotFoundError when customer is not found (status 404)', async () => {
            const mockClient = {
                customer: {
                    fetch: mock.fn(async () => {
                        const err = new Error('Customer not found');
                        err.status = 404;
                        throw err;
                    })
                }
            };

            await assert.rejects(fetchCustomer('missing@example.com', { client: mockClient }), NotFoundError);
        });
    });

    describe('getOrCreateCustomer', () => {
        it('should return created customer when newly registered', async () => {
            const mockClient = {
                customer: {
                    create: mock.fn(async () => ({
                        status: true,
                        data: { customer_code: 'CUS_new_123' }
                    })),
                    fetch: mock.fn()
                }
            };

            const res = await getOrCreateCustomer('new@example.com', 'New', 'User', null, { client: mockClient });
            assert.strictEqual(res.customer_code, 'CUS_new_123');
            assert.strictEqual(mockClient.customer.create.mock.callCount(), 1);
            assert.strictEqual(mockClient.customer.fetch.mock.callCount(), 0);
        });

        it('should gracefully fallback to fetchCustomer if customer already exists', async () => {
            const mockClient = {
                customer: {
                    create: mock.fn(async () => {
                        const err = new Error('Customer already exists');
                        err.statusCode = 400;
                        throw err;
                    }),
                    fetch: mock.fn(async () => ({
                        status: true,
                        data: { customer_code: 'CUS_fetched_existing' }
                    }))
                }
            };

            const res = await getOrCreateCustomer('existing@example.com', 'Alice', 'Doe', null, { client: mockClient });
            assert.strictEqual(res.customer_code, 'CUS_fetched_existing');
            assert.strictEqual(mockClient.customer.create.mock.callCount(), 1);
            assert.strictEqual(mockClient.customer.fetch.mock.callCount(), 1);
        });
    });

    describe('createDedicatedAccount', () => {
        it('should throw BadRequestError if customerCode is missing', async () => {
            await assert.rejects(createDedicatedAccount(''), BadRequestError);
        });

        it('should call dedicated.create with customerCode and test-bank', async () => {
            const mockClient = {
                dedicated: {
                    create: mock.fn(async (payload) => ({
                        status: true,
                        data: {
                            id: 999,
                            account_number: '9988776655',
                            account_name: 'Test Customer',
                            bank: { name: 'Test Bank', id: 1 }
                        }
                    }))
                }
            };

            const res = await createDedicatedAccount('CUS_123', 'test-bank', { client: mockClient });
            assert.strictEqual(res.account_number, '9988776655');
            assert.strictEqual(mockClient.dedicated.create.mock.callCount(), 1);
            assert.deepStrictEqual(mockClient.dedicated.create.mock.calls[0].arguments[0], {
                customer: 'CUS_123',
                preferred_bank: 'test-bank'
            });
        });
    });

    describe('fetchDedicatedAccount', () => {
        it('should throw BadRequestError if dedicatedAccountId is missing', async () => {
            await assert.rejects(fetchDedicatedAccount(''), BadRequestError);
        });

        it('should fetch dedicated account details', async () => {
            const mockClient = {
                dedicated: {
                    fetch: mock.fn(async () => ({
                        status: true,
                        data: { account_number: '9988776655', bank: { name: 'Test Bank' } }
                    }))
                }
            };

            const res = await fetchDedicatedAccount('dva-1', { client: mockClient });
            assert.strictEqual(res.account_number, '9988776655');
            assert.strictEqual(mockClient.dedicated.fetch.mock.callCount(), 1);
        });
    });
});
