import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    fingerprint,
    createRedisKey,
    createRedisLockKey,
    acquireLock,
    releaseLock,
    set,
    get,
    del
} from '../../util/idempotency.js';

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

describe('Idempotency Utility Primitives (Redis)', () => {
    describe('fingerprint', () => {
        it('should generate consistent sha256 hash for identical bodies', () => {
            const hash1 = fingerprint({ amount: 100, to: 'acc-2' });
            const hash2 = fingerprint({ amount: 100, to: 'acc-2' });
            assert.strictEqual(hash1, hash2);
            assert.strictEqual(hash1.length, 64);
        });

        it('should generate different hash for different bodies', () => {
            const hash1 = fingerprint({ amount: 100 });
            const hash2 = fingerprint({ amount: 200 });
            assert.notStrictEqual(hash1, hash2);
        });

        it('should handle empty or null bodies', () => {
            const hashEmpty = fingerprint({});
            const hashNull = fingerprint(null);
            assert.strictEqual(hashEmpty, hashNull);
        });
    });

    describe('Key Formatting', () => {
        it('createRedisKey - should format key as idempotency:type:userId:key', () => {
            const key = createRedisKey('transfer', 'user-123', 'idem-456');
            assert.strictEqual(key, 'idempotency:transfer:user-123:idem-456');
        });

        it('createRedisLockKey - should format key with lock: prefix', () => {
            const lockKey = createRedisLockKey('transfer', 'user-123', 'idem-456');
            assert.strictEqual(lockKey, 'lock:idempotency:transfer:user-123:idem-456');
        });
    });

    describe('acquireLock & releaseLock', () => {
        it('acquireLock - should acquire lock when key does not exist', async () => {
            const mockRedis = createMockRedis();
            const lockKey = createRedisLockKey('transfer', 'user-1', 'key-1');

            const acquired = await acquireLock(mockRedis, lockKey, 30);
            assert.strictEqual(acquired, true);
            assert.strictEqual(mockRedis.store.get(lockKey), '1');
        });

        it('acquireLock - should fail to acquire lock when key is already held', async () => {
            const mockRedis = createMockRedis();
            const lockKey = createRedisLockKey('transfer', 'user-1', 'key-1');

            const first = await acquireLock(mockRedis, lockKey, 30);
            assert.strictEqual(first, true);

            const second = await acquireLock(mockRedis, lockKey, 30);
            assert.strictEqual(second, false);
        });

        it('acquireLock - should return true when client is null', async () => {
            const acquired = await acquireLock(null, 'lock:key', 30);
            assert.strictEqual(acquired, true);
        });

        it('releaseLock - should remove lock key from Redis', async () => {
            const mockRedis = createMockRedis();
            const lockKey = createRedisLockKey('transfer', 'user-1', 'key-1');

            await acquireLock(mockRedis, lockKey, 30);
            assert.strictEqual(mockRedis.store.has(lockKey), true);

            const res = await releaseLock(mockRedis, lockKey);
            assert.strictEqual(res, 1);
            assert.strictEqual(mockRedis.store.has(lockKey), false);
        });

        it('releaseLock - should return 1 when client is null', async () => {
            const res = await releaseLock(null, 'lock:key');
            assert.strictEqual(res, 1);
        });

        it('releaseLock - should handle errors gracefully and return 0', async () => {
            const faultyClient = {
                del: async () => {
                    throw new Error('Connection lost');
                }
            };
            const res = await releaseLock(faultyClient, 'lock:key');
            assert.strictEqual(res, 0);
        });
    });

    describe('set, get, del', () => {
        it('set - should store value with options', async () => {
            const mockRedis = createMockRedis();
            const key = createRedisKey('transfer', 'u1', 'k1');
            const res = await set(mockRedis, key, JSON.stringify({ status: 'PENDING' }), { EX: 300 });
            assert.strictEqual(res, 'OK');
            assert.strictEqual(mockRedis.store.get(key), JSON.stringify({ status: 'PENDING' }));
        });

        it('set - should support numeric ttl options', async () => {
            const mockRedis = createMockRedis();
            const key = createRedisKey('transfer', 'u1', 'k1');
            const res = await set(mockRedis, key, 'val', 60);
            assert.strictEqual(res, 'OK');
        });

        it('set - should return null if client is null', async () => {
            const res = await set(null, 'key', 'val');
            assert.strictEqual(res, null);
        });

        it('get - should retrieve stored value', async () => {
            const mockRedis = createMockRedis();
            const key = createRedisKey('transfer', 'u1', 'k1');
            mockRedis.store.set(key, 'cached-value');

            const val = await get(mockRedis, key);
            assert.strictEqual(val, 'cached-value');
        });

        it('get - should return null when key not found or client null', async () => {
            const mockRedis = createMockRedis();
            assert.strictEqual(await get(mockRedis, 'missing'), null);
            assert.strictEqual(await get(null, 'missing'), null);
        });

        it('del - should delete stored value', async () => {
            const mockRedis = createMockRedis();
            mockRedis.store.set('key-del', 'to-delete');

            const res = await del(mockRedis, 'key-del');
            assert.strictEqual(res, 1);
            assert.strictEqual(mockRedis.store.has('key-del'), false);
        });

        it('del - should return 0 if client is null', async () => {
            const res = await del(null, 'key-del');
            assert.strictEqual(res, 0);
        });
    });
});
