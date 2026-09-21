import User from '../models/user.js';
import Account from '../models/accounts.js';
import * as paystackGateway from '../gateways/paystack/account.js';
import {
    BadRequestError,
    NotFoundError,
    ForbiddenError
} from '../common/domain-exceptions/domain-exceptions.js';

const models = { User, Account };

/**
 * Provisions a Dedicated Virtual Account for a user's ledger account.
 * 
 * @param {string} userId - Compulsory User ID
 * @param {string} accountId - Compulsory Account ID
 * @param {string} [preferredBank='test-bank'] - Preferred bank for DVA (defaults to test-bank in test mode)
 * @param {object} [options={}] - Dependency injection options
 * @returns {Promise<object>} Updated account document
 */
export async function provisionVirtualAccount(
    userId,
    accountId,
    preferredBank = 'test-bank',
    {
        User = models.User,
        Account = models.Account,
        gateway = paystackGateway
    } = {}
) {
    if (!userId) {
        throw BadRequestError('User ID is required');
    }
    if (!accountId) {
        throw BadRequestError('Account ID is required');
    }

    const user = await User.findOne({ id: userId, deleted: { $ne: true } });
    if (!user) {
        throw NotFoundError('User not found', { userId });
    }

    const account = await Account.findOne({ id: accountId, deleted: { $ne: true } });
    if (!account) {
        throw NotFoundError('Account not found', { accountId });
    }

    if (account.userId !== userId) {
        throw ForbiddenError('Account does not belong to the specified user');
    }

    // 1. Resolve or create customer in Paystack
    let customerCode = user.customerCode;
    if (!customerCode) {
        const { firstName, lastName } = gateway.splitName(user.name);
        const customer = await gateway.getOrCreateCustomer(user.email, firstName, lastName, user.phone || null);
        customerCode = customer?.customer_code;
        if (!customerCode) {
            throw BadRequestError('Failed to resolve customer code from Paystack', customer);
        }
        user.customerCode = customerCode;
        await user.save();
    }

    // 2. Create Dedicated Virtual Account
    const dva = await gateway.createDedicatedAccount(customerCode, preferredBank);

    const dvaAccountNumber = dva?.account_number || dva?.accountNumber;
    const dvaBankName = dva?.bank?.name || dva?.bankName || 'Test Bank';
    const dvaBankCode = dva?.bank?.id?.toString() || dva?.bankCode || preferredBank;
    const dvaAccountName = dva?.account_name || dva?.accountName || user.name;
    const assignmentId = dva?.id?.toString() || dva?.assignmentId || null;

    account.accountNumber = dvaAccountNumber || account.accountNumber;
    account.virtualAccount = {
        bankName: dvaBankName,
        bankCode: dvaBankCode,
        accountNumber: dvaAccountNumber,
        accountName: dvaAccountName,
        assignmentId,
        assigned: true
    };

    await account.save();

    return account;
}
