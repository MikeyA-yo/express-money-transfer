import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import {globalConfig} from './env.js';
import { sendNotificationEmail } from '../gateways/react-email/send-email.js';

const redisConfig = globalConfig(process).REDIS_URL;

const redisClient = new IORedis(redisConfig, {
    maxRetriesPerRequest: null, // Disable automatic retries for commands
});

export const transferQueue = new Queue('transfer-notifications', { connection: redisClient });

export const worker = new Worker('transfer-notifications', async (job) => {
    // Process the job data here
    console.log('Processing job:', job.id, 'with data:', job.data);
    if (job.data.email) {
        console.log(`Sending notification email to ${job.data.email} for transfer reference ${job.data.reference}`);
        await sendNotificationEmail({
            to: job.data.email,
            subject: `Transfer Notification: ${job.data.reference}`,
            message: `Your transfer of ${job.data.amount} has been completed successfully.`,
        });
    }
}, { connection: redisClient.duplicate(), concurrency: 5, backoff: { type: 'exponential', delay: 1000 }, maxRetryAttempts: 5, removeOnComplete: true, removeOnFail: true });