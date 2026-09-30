import logger from '../../config/logger.js';

export const CHANNELS = {
    EXTERNAL_TRANSFERS: 'transfers.external',
    INTERNAL_TRANSFERS: 'transfers.internal'
};

export const EVENT_TYPES = {
    TRANSFER_COMPLETED: 'transfer.completed',
    TRANSFER_FAILED: 'transfer.failed'
};

/**
 * Publishes an event message to a Redis Pub/Sub channel.
 * @param {object} client - Redis client
 * @param {string} channel - Channel name (e.g. 'transfers.external')
 * @param {object|string} message - Event payload
 * @returns {Promise<number>} Number of subscribers that received the message
 */
export async function publishEvent(client, channel, message) {
    if (!client || typeof client.publish !== 'function') return 0;
    try {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        return await client.publish(channel, payload);
    } catch (err) {
        logger.warn('Failed to publish event to Redis Pub/Sub', { channel, error: err.message });
        return 0;
    }
}

/**
 * Publishes a transfer completed event to Redis Pub/Sub.
 * @param {object} client - Redis client
 * @param {object} transferData - Details of the completed transfer
 * @param {string} [channel=CHANNELS.EXTERNAL_TRANSFERS] - Channel name
 * @returns {Promise<number>} Number of subscribers that received the message
 */
export async function publishTransferCompleted(client, transferData, channel = CHANNELS.EXTERNAL_TRANSFERS) {
    const payload = {
        event: EVENT_TYPES.TRANSFER_COMPLETED,
        ...transferData,
        timestamp: transferData?.timestamp || new Date().toISOString()
    };
    return await publishEvent(client, channel, payload);
}

/**
 * Publishes a transfer failed event to Redis Pub/Sub.
 * @param {object} client - Redis client
 * @param {object} failureData - Details of the failed transfer
 * @param {string} [channel=CHANNELS.EXTERNAL_TRANSFERS] - Channel name
 * @returns {Promise<number>} Number of subscribers that received the message
 */
export async function publishTransferFailed(client, failureData, channel = CHANNELS.EXTERNAL_TRANSFERS) {
    const payload = {
        event: EVENT_TYPES.TRANSFER_FAILED,
        ...failureData,
        timestamp: failureData?.timestamp || new Date().toISOString()
    };
    return await publishEvent(client, channel, payload);
}
