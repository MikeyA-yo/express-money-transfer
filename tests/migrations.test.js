import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';
import migrateMongo from 'migrate-mongo';
import path from 'path';

before(async () => {
    await connectTestDB();
    migrateMongo.config.set({
        mongodb: {
            url: mongoose.connection.client.options.hosts?.[0] || 'mongodb://localhost:27017',
            databaseName: mongoose.connection.db.databaseName,
            options: {}
        },
        migrationsDir: path.resolve(process.cwd(), 'migrations'),
        changelogCollectionName: 'changelog',
        lockCollectionName: 'changelog_lock',
        lockTtl: 0,
        migrationFileExtension: '.js',
        useFileHash: false,
        moduleSystem: 'esm'
    });
});

afterEach(async () => {
    await clearTestDB();
});

after(async () => {
    await closeTestDB();
});

describe('MongoDB Migrations', () => {
    it('should successfully run pending migrations (up), convert decimal money to minor-unit longs, and be idempotent', async () => {
        const db = mongoose.connection.db;
        const client = mongoose.connection.client;

        const accountsColl = db.collection('accounts');
        const transfersColl = db.collection('transfers');
        const legacyAccount = {
            id: 'legacy-1',
            name: 'Legacy User',
            email: 'legacy@example.com',
            balance: mongoose.Types.Decimal128.fromString('500.00'),
            deleted: false
        };
        const legacyTransfer = {
            id: 'legacy-tr-1',
            fromAccountId: 'legacy-1',
            toAccountId: 'legacy-2',
            amount: mongoose.Types.Decimal128.fromString('25.50'),
            deleted: false
        };
        await accountsColl.insertOne(legacyAccount);
        await transfersColl.insertOne(legacyTransfer);

        const initialStatus = await migrateMongo.status(db);
        assert.ok(initialStatus.length >= 2);
        assert.ok(initialStatus.every((entry) => entry.appliedAt === 'PENDING'));

        const migrated = await migrateMongo.up(db, client);
        assert.strictEqual(migrated.length, 2);

        const updatedAccount = await accountsColl.findOne({ id: 'legacy-1' });
        assert.strictEqual(updatedAccount.currency, 'USD');
        assert.strictEqual(updatedAccount.schemaVersion, 1);
        assert.strictEqual(Number(updatedAccount.balance), 50000);

        const updatedTransfer = await transfersColl.findOne({ id: 'legacy-tr-1' });
        assert.strictEqual(Number(updatedTransfer.amount), 2550);

        const changelogColl = db.collection('changelog');
        const changelogEntry = await changelogColl.findOne({ fileName: migrated[0] });
        assert.ok(changelogEntry !== null && changelogEntry !== undefined);
        assert.ok(changelogEntry.appliedAt instanceof Date);

        const secondRunMigrated = await migrateMongo.up(db, client);
        assert.strictEqual(secondRunMigrated.length, 0);

        const rolledBack = await migrateMongo.down(db, client);
        assert.strictEqual(rolledBack.length, 1);
        assert.strictEqual(rolledBack[0], migrated[1]);

        const accountAfterAmountRollback = await accountsColl.findOne({ id: 'legacy-1' });
        assert.strictEqual(accountAfterAmountRollback.currency, 'USD');
        assert.strictEqual(Number(accountAfterAmountRollback.balance.toString()), 500);

        const transferAfterAmountRollback = await transfersColl.findOne({ id: 'legacy-tr-1' });
        assert.strictEqual(Number(transferAfterAmountRollback.amount.toString()), 25.5);

        const amountMigrationChangelog = await changelogColl.findOne({ fileName: migrated[1] });
        assert.strictEqual(amountMigrationChangelog, null);
    });
});
