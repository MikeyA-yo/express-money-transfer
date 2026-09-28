import crypto from 'crypto';
import { paystack } from '../../config/paystack.js';
import {
    BadRequestError
} from '../../common/domain-exceptions/domain-exceptions.js';
import { handleGatewayError } from './paystack.error.js';

/**
 * Resolves a commercial bank account name via Paystack / NIBSS.
 * 
 * @param {string} accountNumber - 10-digit commercial account number
 * @param {string} bankCode - Commercial bank code (e.g. '058')
 * @param {object} [options={}] - Client injection
 * @returns {Promise<object>} Account resolution data
 */
export async function resolveAccount(accountNumber, bankCode, { client = paystack } = {}) {
    if (!accountNumber) throw BadRequestError('Account number is required for account resolution');
    if (!bankCode) throw BadRequestError('Bank code is required for account resolution');

    try {
        const response = await client.verification.resolveAccount({
            account_number: accountNumber,
            bank_code: bankCode
        });

        if (response?.status && response?.data) {
            return response.data;
        }
        throw new Error(response?.message || 'Could not resolve account details');
    } catch (err) {
        throw handleGatewayError(err, 'resolveAccount');
    }
}

/**
 * Creates a Transfer Recipient in Paystack.
 * 
 * @param {string} name - Account holder name
 * @param {string} accountNumber - 10-digit NUBAN account number
 * @param {string} bankCode - Bank code
 * @param {string} [currency='NGN'] - Currency code
 * @param {object} [options={}] - Client injection
 * @returns {Promise<object>} Recipient data containing recipient_code
 */
export async function createTransferRecipient(name, accountNumber, bankCode, currency = 'NGN', { client = paystack } = {}) {
    if (!name) throw BadRequestError('Recipient name is required');
    if (!accountNumber) throw BadRequestError('Recipient account number is required');
    if (!bankCode) throw BadRequestError('Recipient bank code is required');

    try {
        const payload = {
            type: 'nuban',
            name,
            account_number: accountNumber,
            bank_code: bankCode,
            currency
        };

        const response = await client.recipient.create(payload);
        if (response?.status && response?.data) {
            return response.data;
        }
        throw new Error(response?.message || 'Failed to create transfer recipient');
    } catch (err) {
        throw handleGatewayError(err, 'createTransferRecipient');
    }
}

/**
 * Initiates an external transfer / payout in Paystack.
 * 
 * @param {number|bigint} amountMinor - Transfer amount in minor units (e.g. kobo)
 * @param {string} recipientCode - Paystack recipient code (e.g. 'RCP_xxx')
 * @param {string} reference - Unique transaction reference
 * @param {string} [reason=''] - Optional narration / reason
 * @param {object} [options={}] - Client injection
 * @returns {Promise<object>} Transfer response data containing transfer_code and status
 */
export async function initiateTransfer(amountMinor, recipientCode, reference, reason = '', { client = paystack } = {}) {
    if (!amountMinor || BigInt(amountMinor) <= 0n) throw BadRequestError('Valid transfer amount in minor units is required');
    if (!recipientCode) throw BadRequestError('Recipient code is required');
    if (!reference) throw BadRequestError('Unique reference is required');

    try {
        const payload = {
            source: 'balance',
            amount: Number(amountMinor),
            recipient: recipientCode,
            reference,
            reason: reason || 'Transfer'
        };

        const response = await client.transfer.initiate(payload);
        if (response?.status && response?.data) {
            return response.data;
        }
        throw new Error(response?.message || 'Failed to initiate transfer');
    } catch (err) {
        throw handleGatewayError(err, 'initiateTransfer');
    }
}

/**
 * Verifies an external transfer status in Paystack.
 * 
 * @param {string} reference - Unique transaction reference
 * @param {object} [options={}] - Client injection
 * @returns {Promise<object>}
 */
export async function verifyTransfer(reference, { client = paystack } = {}) {
    if (!reference) throw BadRequestError('Reference is required for transfer verification');

    try {
        const response = await client.transfer.verify(reference);
        if (response?.status && response?.data) {
            return response.data;
        }
        throw new Error(response?.message || 'Failed to verify transfer');
    } catch (err) {
        throw handleGatewayError(err, 'verifyTransfer');
    }
}

/**
 * Cryptographically verifies a Paystack webhook HMAC-SHA512 signature against the raw body buffer.
 * 
 * @param {Buffer|string} rawBody - Raw body buffer or string of the incoming request
 * @param {string} signature - Header value from 'x-paystack-signature'
 * @param {string} secretKey - Paystack secret key
 * @returns {boolean} True if signature is valid, false otherwise
 */
export function verifyWebhookSignature(rawBody, signature, secretKey) {
    if (!rawBody || !signature || !secretKey) {
        return false;
    }

    try {
        const computed = crypto
            .createHmac('sha512', secretKey)
            .update(rawBody)
            .digest('hex');

        const signatureBuffer = Buffer.from(signature, 'utf8');
        const computedBuffer = Buffer.from(computed, 'utf8');

        if (signatureBuffer.length !== computedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
    } catch {
        return false;
    }
}
