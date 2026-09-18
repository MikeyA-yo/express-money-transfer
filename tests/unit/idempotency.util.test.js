import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { idempotency, fingerprint } from '../../util/idempotency.js';
import {
    BadRequestError,
    UnauthorizedError,
    ConflictError,
    UnprocessableEntityError
} from '../../common/domain-exceptions/domain-exceptions.js';

function createMockRedis() {
    const store = new Map();
    return {
        store,
        async set(key, value, options = {}) {
            if (options.NX && store.has(key)) {
                return null;
            }
            store.set(key, value);
            return 'OK';
        },
        async get(key) {
            return store.get(key) || null;
        },
        async del(key) {
            const existed = store.has(key);
            store.delete(key);
            return existed ? 1 : 0;
        }
    };
}

describe('Idempotency Utility (Redis)', () => {
    it('should throw BadRequestError when key is missing', async () => {
        await assert.rejects(
            () => idempotency('', 'user-1', {}, async () => {}),
            (err) => {
                assert.ok(err instanceof BadRequestError);
                assert.strictEqual(err.message, 'Missing Idempotency-Key');
                return true;
            }
        );
    });

    it('should throw UnauthorizedError when userId is missing', async () => {
        await assert.rejects(
            () => idempotency('key-1', '', {}, async () => {}),
            (err) => {
                assert.ok(err instanceof UnauthorizedError);
                assert.strictEqual(err.message, 'Authentication required');
                return true;
            }
        );
    });

    it('should throw BadRequestError when function is missing', async () => {
        await assert.rejects(
            () => idempotency('key-1', 'user-1', {}),
            (err) => {
                assert.ok(err instanceof BadRequestError);
                assert.strictEqual(err.message, 'Function to execute is required');
                return true;
            }
        );
    });

    it('should execute function and store result in Redis on first call', async () => {
        const mockRedis = createMockRedis();
        let executionCount = 0;

        const result = await idempotency(
            'key-1',
            'user-1',
            { amount: 100 },
            async () => {
                executionCount++;
                return { transferId: 'tx-123', status: 'COMPLETED' };
            },
            { redis: mockRedis }
        );

        assert.strictEqual(executionCount, 1);
        assert.deepStrictEqual(result, { transferId: 'tx-123', status: 'COMPLETED' });

        const record = JSON.parse(await mockRedis.get('idempotency:user-1:key-1'));
        assert.strictEqual(record.status, 'COMPLETED');
        assert.deepStrictEqual(record.responseBody, { transferId: 'tx-123', status: 'COMPLETED' });
    });

    it('should replay cached response on second call with same body without re-executing', async () => {
        const mockRedis = createMockRedis();
        let executionCount = 0;

        const run = () => idempotency(
            'key-1',
            'user-1',
            { amount: 100 },
            async () => {
                executionCount++;
                return { transferId: 'tx-123', status: 'COMPLETED' };
            },
            { redis: mockRedis }
        );

        const firstResult = await run();
        const secondResult = await run();

        assert.strictEqual(executionCount, 1);
        assert.deepStrictEqual(firstResult, secondResult);
    });

    it('should throw UnprocessableEntityError if key is reused with different request body', async () => {
        const mockRedis = createMockRedis();

        await idempotency(
            'key-1',
            'user-1',
            { amount: 100 },
            async () => ({ transferId: 'tx-123' }),
            { redis: mockRedis }
        );

        await assert.rejects(
            () => idempotency(
                'key-1',
                'user-1',
                { amount: 200 },
                async () => ({ transferId: 'tx-456' }),
                { redis: mockRedis }
            ),
            (err) => {
                assert.ok(err instanceof UnprocessableEntityError);
                assert.strictEqual(err.message, 'Idempotency key reused with different request body');
                return true;
            }
        );
    });

    it('should throw ConflictError if request is currently IN_PROGRESS', async () => {
        const mockRedis = createMockRedis();
        const reqFingerprint = fingerprint({ amount: 100 });

        await mockRedis.set(
            'idempotency:user-1:key-1',
            JSON.stringify({
                key: 'key-1',
                userId: 'user-1',
                status: 'IN_PROGRESS',
                requestFingerprint: reqFingerprint
            })
        );

        await assert.rejects(
            () => idempotency(
                'key-1',
                'user-1',
                { amount: 100 },
                async () => ({ transferId: 'tx-123' }),
                { redis: mockRedis }
            ),
            (err) => {
                assert.ok(err instanceof ConflictError);
                assert.strictEqual(err.message, 'A request with this Idempotency-Key is already being processed');
                return true;
            }
        );
    });

    it('should release key and throw ConflictError when previous request FAILED', async () => {
        const mockRedis = createMockRedis();
        const reqFingerprint = fingerprint({ amount: 100 });

        await mockRedis.set(
            'idempotency:user-1:key-1',
            JSON.stringify({
                key: 'key-1',
                userId: 'user-1',
                status: 'FAILED',
                requestFingerprint: reqFingerprint
            })
        );

        await assert.rejects(
            () => idempotency(
                'key-1',
                'user-1',
                { amount: 100 },
                async () => ({ transferId: 'tx-123' }),
                { redis: mockRedis }
            ),
            (err) => {
                assert.ok(err instanceof ConflictError);
                assert.match(err.message, /The previous request with this key failed/);
                return true;
            }
        );

        // Key should have been released (deleted)
        const record = await mockRedis.get('idempotency:user-1:key-1');
        assert.strictEqual(record, null);
    });

    it('should mark record as FAILED and rethrow error if fn throws', async () => {
        const mockRedis = createMockRedis();

        await assert.rejects(
            () => idempotency(
                'key-1',
                'user-1',
                { amount: 100 },
                async () => {
                    throw new Error('Database down');
                },
                { redis: mockRedis }
            ),
            (err) => {
                assert.strictEqual(err.message, 'Database down');
                return true;
            }
        );

        const record = JSON.parse(await mockRedis.get('idempotency:user-1:key-1'));
        assert.strictEqual(record.status, 'FAILED');
        assert.strictEqual(record.error.message, 'Database down');
    });

    it('should support explicit positional arguments (key, userId, body, fn, options)', async () => {
        const mockRedis = createMockRedis();

        const result = await idempotency(
            'key-pos',
            'user-pos',
            { foo: 'bar' },
            async () => 'success',
            { redis: mockRedis }
        );

        assert.strictEqual(result, 'success');
    });
});
