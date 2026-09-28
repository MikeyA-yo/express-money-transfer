import {
    BadRequestError,
    NotFoundError,
    ServiceUnavailableError,
    isTransientError
} from '../../common/domain-exceptions/domain-exceptions.js';
import logger from '../../config/logger.js';

/**
 * Maps raw Paystack / external network errors to clean domain exceptions.
 * Ensures internal provider payloads and transient network details are logged
 * on the server, while returning sanitized, user-friendly messages to the caller.
 *
 * @param {Error} err - Captured error object
 * @param {string} operation - Name of the gateway operation
 * @returns {Error} Formatted domain exception
 */
export function handleGatewayError(err, operation) {
    if (err?.statusCode && err?.isOperational) {
        return err;
    }

    const providerStatus = err?.status || err?.statusCode || 500;
    const providerMessage = err?.body?.message || err?.message || 'Gateway operation failed';
    const providerCode = err?.body?.code || err?.code;

    // Log the full raw error internally for audit and debugging
    logger.error(`Paystack ${operation} failure:`, {
        operation,
        status: providerStatus,
        message: providerMessage,
        code: providerCode,
        details: err?.body || err
    });

    // Handle transient / network / server busy errors
    if (isTransientError(err) || providerStatus === 502 || providerStatus === 503 || providerStatus === 504 || providerStatus === 429) {
        return ServiceUnavailableError('Payment gateway is temporarily busy. Please try again in a moment.');
    }

    // Map operation-specific client errors to friendly messages without leaking internal payloads
    if (operation === 'resolveAccount') {
        return BadRequestError('Unable to resolve recipient bank account. Please verify the account number and bank code.');
    }

    if (operation === 'createTransferRecipient') {
        return BadRequestError('Unable to set up transfer recipient with the provided bank details.');
    }

    if (operation === 'initiateTransfer') {
        return BadRequestError('Unable to process payout at this time. Please try again later or contact support.');
    }

    if (operation === 'verifyTransfer') {
        if (providerStatus === 404) {
            return NotFoundError('Transfer record not found on payment gateway');
        }
        return ServiceUnavailableError('Unable to verify transfer status at this time. Please try again shortly.');
    }

    return BadRequestError('Unable to complete payment operation. Please try again later.');
}