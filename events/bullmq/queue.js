import { transferQueue } from '../../config/bullmq.js';
export async function publishTransferJob(jobData, queue = transferQueue) {
    return await queue.add('transfer-job', jobData, {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: jobData?.idempotencyKey || undefined
    });
}