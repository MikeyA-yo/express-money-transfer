import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { globalConfig } from '../config/env.js';
import User from '../models/user.js';
import { splitName, getOrCreateCustomer } from '../gateways/paystack/account.js';
import logger from '../config/logger.js';

async function backfillCustomerCodes() {
    const { MONGODB_URI } = globalConfig(process);
    await connectDB(MONGODB_URI);
    logger.info('Connected to MongoDB. Starting Paystack customerCode backfill...');

    const users = await User.find({
        $or: [
            { customerCode: { $exists: false } },
            { customerCode: null },
            { customerCode: '' }
        ]
    });

    logger.info(`Found ${users.length} users needing customerCode backfill.`);

    let updated = 0;
    let failed = 0;

    for (const user of users) {
        try {
            const { firstName, lastName } = splitName(user.name);
            const customer = await getOrCreateCustomer(user.email, firstName, lastName);
            if (customer?.customer_code) {
                user.customerCode = customer.customer_code;
                await user.save();
                updated++;
                logger.info(`Updated user ${user.id} (${user.email}) -> ${customer.customer_code}`);
            } else {
                failed++;
                logger.warn(`No customer_code returned for user ${user.id} (${user.email})`);
            }
        } catch (err) {
            failed++;
            logger.error(`Failed to backfill customer for user ${user.id} (${user.email}):`, err.message);
        }
    }

    logger.info(`Backfill complete. Updated: ${updated}, Failed: ${failed}`);
    await mongoose.connection.close();
    process.exit(0);
}

backfillCustomerCodes().catch(async (err) => {
    logger.error('Backfill script encountered fatal error:', err);
    await mongoose.connection.close();
    process.exit(1);
});
