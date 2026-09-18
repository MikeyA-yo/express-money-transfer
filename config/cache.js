import { createClient } from 'redis';

async function createRedisClient(redis_url) {
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

export default createRedisClient;