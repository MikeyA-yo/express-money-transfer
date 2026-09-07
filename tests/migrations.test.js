import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';
import { jest } from '@jest/globals';
import migrateMongo from 'migrate-mongo';
import path from 'path';

jest.setTimeout(3600000);

beforeAll(async () => {
    await connectTestDB();
    // Configure migrate-mongo in-memory to use the test database & project migrations directory
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

afterAll(async () => {
    await closeTestDB();
});

describe('MongoDB Migrations', () => {
    it('should successfully run pending migrations (up), update documents, and be idempotent', async () => {
        const db = mongoose.connection.db;
        const client = mongoose.connection.client;

        // 1. Seed unmigrated legacy documents directly using raw collection (bypassing Mongoose schema)
        const accountsColl = db.collection('accounts');
        const legacyDoc = {
            id: 'legacy-1',
            name: 'Legacy User',
            email: 'legacy@example.com',
            balance: 500,
            deleted: false
            // Note: currency and schemaVersion are absent
        };
        await accountsColl.insertOne(legacyDoc);

        // 2. Check initial migration status
        const initialStatus = await migrateMongo.status(db);
        expect(initialStatus.length).toBeGreaterThan(0);
        expect(initialStatus[0].appliedAt).toEqual('PENDING');

        // 3. Run migrations up
        const migrated = await migrateMongo.up(db, client);
        expect(migrated.length).toBe(1);

        // 4. Verify document was updated with new schema fields
        const updatedDoc = await accountsColl.findOne({ id: 'legacy-1' });
        expect(updatedDoc.currency).toEqual('USD');
        expect(updatedDoc.schemaVersion).toEqual(1);

        // 5. Verify changelog collection has recorded the migration
        const changelogColl = db.collection('changelog');
        const changelogEntry = await changelogColl.findOne({ fileName: migrated[0] });
        expect(changelogEntry).toBeDefined();
        expect(changelogEntry.appliedAt).toBeInstanceOf(Date);

        // 6. Test IDEMPOTENCY: running up again should do nothing
        const secondRunMigrated = await migrateMongo.up(db, client);
        expect(secondRunMigrated.length).toEqual(0);

        // 7. Test ROLLBACK (down)
        const rolledBack = await migrateMongo.down(db, client);
        expect(rolledBack.length).toBe(1);

        const docAfterRollback = await accountsColl.findOne({ id: 'legacy-1' });
        expect(docAfterRollback.currency).toBeUndefined();

        // Changelog entry should be removed
        const changelogAfterRollback = await changelogColl.findOne({ fileName: migrated[0] });
        expect(changelogAfterRollback).toBeNull();
    });
});
