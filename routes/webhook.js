import express from 'express';
import { paystackWebhookHandler } from '../controllers/webhook.js';

const router = express.Router();

router.post('/paystack', paystackWebhookHandler());

export default router;
