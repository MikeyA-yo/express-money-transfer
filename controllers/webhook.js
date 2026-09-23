import { StatusCodes } from 'http-status-codes';
import logger from '../config/logger.js';
import * as webhookService from '../services/webhook.js';

export const paystackWebhookHandler = ({ handleWebhook = webhookService.handlePaystackWebhook } = {}) => async (req, res) => {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const outcome = await handleWebhook(req.body, signature, rawBody);

    logger.info('Paystack webhook processed', outcome);

    return res.status(StatusCodes.OK).json({ status: 'ok', ...outcome });
};
