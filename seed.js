import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { globalConfig } from './config/env.js';
import logger from './config/logger.js';
import Admin, { runSeed as runAdminSeed } from './models/admin.js';
import Account from './models/accounts.js';
import User, { runSeed as runUserSeed } from './models/user.js';

const { MONGODB_URI } = globalConfig(process);
const SALT_ROUNDS = 10;
const DEFAULT_SEED_PASSWORD = '123456';

export async function seedAdmins() {
    const adminsToSeed = [
        { email: 'admin1@email.com', role: 'admin', password: DEFAULT_SEED_PASSWORD },
        { email: 'admin2@email.com', role: 'admin', password: DEFAULT_SEED_PASSWORD }
    ];

    for (const adminData of adminsToSeed) {
        const passwordHash = await bcrypt.hash(adminData.password, SALT_ROUNDS);
        const existing = await Admin.findOne({ email: adminData.email });
        if (existing) {
            existing.password = passwordHash;
            existing.role = adminData.role;
            await existing.save();
            logger.info(`Updated existing admin with bcrypt hashed password: ${existing.email} (id: ${existing.id}, role: ${existing.role})`);
        } else {
            const created = await runAdminSeed(adminData.email, adminData.role, passwordHash);
            logger.info(`Seeded admin successfully with bcrypt hash: ${created.email} (id: ${created.id}, role: ${created.role})`);
        }
    }
    logger.info('Admin seeding completed.');
}

export async function seedUsersFromAccounts() {
    logger.info('Querying accounts collection for existing accounts...');
    const accounts = await Account.find({ deleted: { $ne: true } });
    logger.info(`Found ${accounts.length} active account(s) to seed users for.`);

    for (const account of accounts) {
        const passwordHash = await bcrypt.hash(DEFAULT_SEED_PASSWORD, SALT_ROUNDS);

        let user = await User.findOne({
            $or: [{ id: account.userId }, { email: account.email }]
        });

        if (user) {
            user.name = account.name;
            user.email = account.email;
            user.password = passwordHash;
            await user.save();
            logger.info(`Updated existing user for account ${account.id}: ${user.name} (${user.email})`);
        } else {
            user = await runUserSeed({
                id: account.userId || account.id,
                name: account.name,
                email: account.email,
                password: passwordHash
            });
            logger.info(`Seeded user successfully: ${user.name} (${user.email}) for account ${account.id}`);
        }

        if (!account.userId || account.userId !== user.id) {
            account.userId = user.id;
            await account.save();
        }
    }
    logger.info('User seeding from accounts completed.');
}

export async function runAllSeeds() {
    await connectDB(MONGODB_URI);
    try {
        await seedAdmins();
        await seedUsersFromAccounts();
        logger.info('All database seeding finished successfully.');
    } catch (error) {
        logger.error(`Error during seeding: ${error.message}`);
        throw error;
    } finally {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed.');
    }
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
    runAllSeeds().catch(() => process.exit(1));
}
