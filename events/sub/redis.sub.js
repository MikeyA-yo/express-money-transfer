import logger from '../../config/logger.js';
import { CHANNELS } from '../pub/redis.pub.js';

/**
 * Subscribes to one or more Redis Pub/Sub channels with automatic JSON deserialization.
 * 
 * Note: Redis requires a dedicated client in subscriber mode. The client passed here
 * should be dedicated or created via client.duplicate().
 *
 * @param {object} subscriberClient - Redis client (or duplicated client)
 * @param {string|string[]} channels - Single channel name or array of channel names
 * @param {Function} messageHandler - Callback invoked with (parsedPayload, channel)
 * @returns {Promise<{ unsubscribe: Function }>} Object with unsubscribe method
 */
export async function subscribeToChannel(subscriberClient, channels, messageHandler) {
    if (!subscriberClient || typeof subscriberClient.subscribe !== 'function') {
        throw new Error('A valid Redis client with .subscribe() method is required');
    }

    const channelList = Array.isArray(channels) ? channels : [channels];

    const listener = (rawMessage, channel) => {
        let parsed;
        try {
            parsed = JSON.parse(rawMessage);
        } catch {
            parsed = rawMessage;
        }

        try {
            messageHandler(parsed, channel);
        } catch (handlerErr) {
            logger.error('Error in Redis Pub/Sub message handler', {
                channel,
                error: handlerErr.message
            });
        }
    };

    for (const ch of channelList) {
        await subscriberClient.subscribe(ch, listener);
        logger.info(`Subscribed to Redis channel: ${ch}`);
    }

    return {
        unsubscribe: async () => {
            for (const ch of channelList) {
                if (typeof subscriberClient.unsubscribe === 'function') {
                    await subscriberClient.unsubscribe(ch, listener);
                    logger.info(`Unsubscribed from Redis channel: ${ch}`);
                }
            }
        }
    };
}

export { CHANNELS };
