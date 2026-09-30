import { createClient } from 'redis'; //redis.io

export default async function createRedisClient(redis_url) {
    const client = createClient({
        url: redis_url
    });
    client.on('error', (err) => {
        // Prevent uncaught error event crashes
    });
    if (!client.isOpen) {
        await client.connect();
    }
    return client;
}

// Singleton Redis client instance
let singletonRedisClient = null;

export async function getRedisClient() {
    if (!singletonRedisClient) {
        singletonRedisClient = await createRedisClient(process.env.REDIS_URL || 'redis://localhost:6379');
    }
    return singletonRedisClient;
}