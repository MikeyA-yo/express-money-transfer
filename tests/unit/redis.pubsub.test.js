import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHANNELS,
    EVENT_TYPES,
    publishEvent,
    publishTransferCompleted,
    publishTransferFailed
} from '../../events/pub/redis.pub.js';
import { subscribeToChannel } from '../../events/sub/redis.sub.js';

describe('Redis Pub/Sub Utilities', () => {
    describe('Publisher (events/pub/redis.pub.js)', () => {
        it('should return 0 when client is null or lacks publish method', async () => {
            const res1 = await publishEvent(null, 'test.channel', { hello: 'world' });
            assert.strictEqual(res1, 0);

            const res2 = await publishEvent({}, 'test.channel', { hello: 'world' });
            assert.strictEqual(res2, 0);
        });

        it('should stringify object payload and call client.publish', async () => {
            const mockClient = {
                publish: mock.fn(async (ch, msg) => 1)
            };

            const count = await publishEvent(mockClient, 'custom.channel', { foo: 'bar', num: 42 });
            assert.strictEqual(count, 1);
            assert.strictEqual(mockClient.publish.mock.callCount(), 1);
            assert.strictEqual(mockClient.publish.mock.calls[0].arguments[0], 'custom.channel');
            assert.strictEqual(
                mockClient.publish.mock.calls[0].arguments[1],
                JSON.stringify({ foo: 'bar', num: 42 })
            );
        });

        it('should support string payloads directly', async () => {
            const mockClient = {
                publish: mock.fn(async () => 2)
            };

            const count = await publishEvent(mockClient, 'string.channel', 'plain-text-message');
            assert.strictEqual(count, 2);
            assert.strictEqual(mockClient.publish.mock.calls[0].arguments[1], 'plain-text-message');
        });

        it('should catch errors gracefully and return 0 if client.publish throws', async () => {
            const mockClient = {
                publish: mock.fn(async () => {
                    throw new Error('Redis connection lost');
                })
            };

            const count = await publishEvent(mockClient, 'test.channel', { test: true });
            assert.strictEqual(count, 0);
        });

        it('publishTransferCompleted - should publish transfer.completed event to transfers.external', async () => {
            const mockClient = {
                publish: mock.fn(async () => 1)
            };

            const transferData = {
                transferId: 'ext-123',
                reference: 'ref-abc',
                fromAccountId: 'acc-1',
                userId: 'user-1',
                amount: 50000,
                currency: 'NGN',
                status: 'COMPLETED'
            };

            const count = await publishTransferCompleted(mockClient, transferData);
            assert.strictEqual(count, 1);
            assert.strictEqual(mockClient.publish.mock.callCount(), 1);
            assert.strictEqual(mockClient.publish.mock.calls[0].arguments[0], CHANNELS.EXTERNAL_TRANSFERS);

            const publishedPayload = JSON.parse(mockClient.publish.mock.calls[0].arguments[1]);
            assert.strictEqual(publishedPayload.event, EVENT_TYPES.TRANSFER_COMPLETED);
            assert.strictEqual(publishedPayload.transferId, 'ext-123');
            assert.strictEqual(publishedPayload.reference, 'ref-abc');
            assert.strictEqual(publishedPayload.amount, 50000);
            assert.ok(publishedPayload.timestamp);
        });

        it('publishTransferFailed - should publish transfer.failed event with reason to transfers.external', async () => {
            const mockClient = {
                publish: mock.fn(async () => 1)
            };

            const failureData = {
                transferId: 'ext-456',
                reference: 'ref-def',
                fromAccountId: 'acc-1',
                userId: 'user-1',
                amount: 25000,
                reason: 'Account resolution failed'
            };

            const count = await publishTransferFailed(mockClient, failureData);
            assert.strictEqual(count, 1);
            assert.strictEqual(mockClient.publish.mock.calls[0].arguments[0], CHANNELS.EXTERNAL_TRANSFERS);

            const publishedPayload = JSON.parse(mockClient.publish.mock.calls[0].arguments[1]);
            assert.strictEqual(publishedPayload.event, EVENT_TYPES.TRANSFER_FAILED);
            assert.strictEqual(publishedPayload.transferId, 'ext-456');
            assert.strictEqual(publishedPayload.reason, 'Account resolution failed');
            assert.ok(publishedPayload.timestamp);
        });
    });

    describe('Subscriber (events/sub/redis.sub.js)', () => {
        it('should throw an error if subscriberClient is missing or lacks subscribe method', async () => {
            await assert.rejects(
                subscribeToChannel(null, 'test.channel', () => {}),
                /A valid Redis client with \.subscribe\(\) method is required/
            );

            await assert.rejects(
                subscribeToChannel({}, 'test.channel', () => {}),
                /A valid Redis client with \.subscribe\(\) method is required/
            );
        });

        it('should subscribe to single channel and invoke handler with parsed JSON', async () => {
            let registeredListener = null;
            const mockSubscriber = {
                subscribe: mock.fn(async (channel, listener) => {
                    registeredListener = listener;
                }),
                unsubscribe: mock.fn(async () => {})
            };

            const received = [];
            const sub = await subscribeToChannel(mockSubscriber, 'orders', (payload, ch) => {
                received.push({ payload, ch });
            });

            assert.strictEqual(mockSubscriber.subscribe.mock.callCount(), 1);
            assert.strictEqual(mockSubscriber.subscribe.mock.calls[0].arguments[0], 'orders');

            // Simulate incoming message
            const testPayload = { orderId: 99, status: 'PAID' };
            registeredListener(JSON.stringify(testPayload), 'orders');

            assert.strictEqual(received.length, 1);
            assert.deepStrictEqual(received[0].payload, testPayload);
            assert.strictEqual(received[0].ch, 'orders');

            // Test unsubscribe
            await sub.unsubscribe();
            assert.strictEqual(mockSubscriber.unsubscribe.mock.callCount(), 1);
            assert.strictEqual(mockSubscriber.unsubscribe.mock.calls[0].arguments[0], 'orders');
        });

        it('should subscribe to multiple channels', async () => {
            const mockSubscriber = {
                subscribe: mock.fn(async () => {}),
                unsubscribe: mock.fn(async () => {})
            };

            const sub = await subscribeToChannel(
                mockSubscriber,
                ['ch-1', 'ch-2'],
                () => {}
            );

            assert.strictEqual(mockSubscriber.subscribe.mock.callCount(), 2);
            assert.strictEqual(mockSubscriber.subscribe.mock.calls[0].arguments[0], 'ch-1');
            assert.strictEqual(mockSubscriber.subscribe.mock.calls[1].arguments[0], 'ch-2');

            await sub.unsubscribe();
            assert.strictEqual(mockSubscriber.unsubscribe.mock.callCount(), 2);
        });

        it('should handle non-JSON string gracefully without crashing', async () => {
            let registeredListener = null;
            const mockSubscriber = {
                subscribe: mock.fn(async (ch, listener) => {
                    registeredListener = listener;
                })
            };

            let receivedPayload = null;
            await subscribeToChannel(mockSubscriber, 'raw.channel', (payload) => {
                receivedPayload = payload;
            });

            // Dispatch non-JSON plain string
            registeredListener('not-valid-json', 'raw.channel');
            assert.strictEqual(receivedPayload, 'not-valid-json');
        });

        it('should safely catch errors thrown inside handler without terminating', async () => {
            let registeredListener = null;
            const mockSubscriber = {
                subscribe: mock.fn(async (ch, listener) => {
                    registeredListener = listener;
                })
            };

            await subscribeToChannel(mockSubscriber, 'err.channel', () => {
                throw new Error('Handler unexpected failure');
            });

            // Should not throw or crash
            assert.doesNotThrow(() => {
                registeredListener(JSON.stringify({ test: 1 }), 'err.channel');
            });
        });
    });
});
