import paystack from '../../config/paystack.js';
import {
    BadRequestError,
    NotFoundError,
    ServiceLayerError
} from '../../common/domain-exceptions/domain-exceptions.js';

/**
 * Splits a full name string into first and last name components.
 * @param {string} fullName 
 * @returns {{ firstName: string, lastName: string }}
 */
export function splitName(fullName = '') {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Customer';
    const lastName = parts.slice(1).join(' ') || parts[0] || 'User';
    return { firstName, lastName };
}

/**
 * Creates a new customer in Paystack.
 * @param {string} email - Compulsory customer email
 * @param {string} firstName - Compulsory first name
 * @param {string} lastName - Compulsory last name
 * @param {string|null} [phone=null] - Optional phone number
 * @param {object} [options={}] - Optional client injection
 * @returns {Promise<object>} Paystack customer object
 */
export async function createCustomer(email, firstName, lastName, phone = null, { client = paystack } = {}) {
    if (!email) throw BadRequestError('Customer email is required');
    if (!firstName) throw BadRequestError('Customer first name is required');
    if (!lastName) throw BadRequestError('Customer last name is required');

    try {
        const payload = {
            email,
            first_name: firstName,
            last_name: lastName,
            ...(phone ? { phone } : {})
        };
        const response = await client.customer.create(payload);
        if (response?.status && response?.data) {
            return response.data;
        }
        throw BadRequestError(response?.message || 'Failed to create Paystack customer', response);
    } catch (err) {
        if (err.statusCode || err.isOperational) throw err;
        throw ServiceLayerError(err?.message || 'Paystack customer creation error', 500, err?.body || err);
    }
}

/**
 * Fetches an existing customer from Paystack by email or customer code.
 * @param {string} emailOrCode - Compulsory email or customer_code
 * @param {object} [options={}] - Optional client injection
 * @returns {Promise<object>} Paystack customer object
 */
export async function fetchCustomer(emailOrCode, { client = paystack } = {}) {
    if (!emailOrCode) throw BadRequestError('Email or customer code is required to fetch customer');

    try {
        const response = await client.customer.fetch(emailOrCode);
        if (response?.status && response?.data) {
            return response.data;
        }
        throw NotFoundError(response?.message || 'Paystack customer not found', { emailOrCode });
    } catch (err) {
        if (err.statusCode || err.isOperational) throw err;
        const status = err?.status === 404 ? 404 : 500;
        if (status === 404) {
            throw NotFoundError('Paystack customer not found', { emailOrCode });
        }
        throw ServiceLayerError(err?.message || 'Error fetching Paystack customer', status, err?.body || err);
    }
}

/**
 * Resolves a customer in Paystack: creates if new, or fetches if already exists.
 * @param {string} email - Compulsory customer email
 * @param {string} firstName - Compulsory first name
 * @param {string} lastName - Compulsory last name
 * @param {string|null} [phone=null] - Optional phone number
 * @param {object} [options={}] - Optional client injection
 * @returns {Promise<object>} Paystack customer object with customer_code
 */
export async function getOrCreateCustomer(email, firstName, lastName, phone = null, { client = paystack } = {}) {
    if (!email) throw BadRequestError('Email is required');

    try {
        const created = await createCustomer(email, firstName, lastName, phone, { client });
        if (created?.customer_code) {
            return created;
        }
    } catch (err) {
        // If creation fails due to duplicate email or known customer error, fetch existing
        const msg = String(err?.message || err?.details?.message || '').toLowerCase();
        if (msg.includes('already exists') || msg.includes('duplicate') || err?.statusCode === 400) {
            return await fetchCustomer(email, { client });
        }
        throw err;
    }

    return await fetchCustomer(email, { client });
}

/**
 * Creates a Dedicated Virtual Account (DVA) for a Paystack customer.
 * In test mode, preferredBank must be 'test-bank'.
 * @param {string} customerCode - Compulsory Paystack customer code (e.g. CUS_xxxx)
 * @param {string} [preferredBank='test-bank'] - Preferred bank (defaults to test-bank in test mode)
 * @param {object} [options={}] - Optional client injection
 * @returns {Promise<object>} Dedicated account data
 */
export async function createDedicatedAccount(customerCode, preferredBank = 'test-bank', { client = paystack } = {}) {
    if (!customerCode) throw BadRequestError('Customer code is required to create a dedicated virtual account');

    try {
        const payload = {
            customer: customerCode,
            preferred_bank: preferredBank
        };
        const response = await client.dedicated.create(payload);
        if (response?.status && response?.data) {
            return response.data;
        }
        throw BadRequestError(response?.message || 'Failed to create dedicated virtual account', response);
    } catch (err) {
        if (err.statusCode || err.isOperational) throw err;
        const statusCode = err?.status || 500;
        const message = err?.body?.message || err?.message || 'Paystack DVA creation error';
        throw ServiceLayerError(message, statusCode, err?.body || err);
    }
}

/**
 * Fetches dedicated virtual account details by ID or account number.
 * @param {string} dedicatedAccountId - Compulsory DVA identifier
 * @param {object} [options={}] - Optional client injection
 * @returns {Promise<object>}
 */
export async function fetchDedicatedAccount(dedicatedAccountId, { client = paystack } = {}) {
    if (!dedicatedAccountId) throw BadRequestError('Dedicated account ID is required');

    try {
        const response = await client.dedicated.fetch(dedicatedAccountId);
        if (response?.status && response?.data) {
            return response.data;
        }
        throw NotFoundError(response?.message || 'Dedicated virtual account not found', { dedicatedAccountId });
    } catch (err) {
        if (err.statusCode || err.isOperational) throw err;
        const status = err?.status === 404 ? 404 : 500;
        if (status === 404) {
            throw NotFoundError('Dedicated virtual account not found', { dedicatedAccountId });
        }
        throw ServiceLayerError(err?.message || 'Error fetching dedicated virtual account', status, err?.body || err);
    }
}
