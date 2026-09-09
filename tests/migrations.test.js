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
    it('should successfully run pending migrations (up), update documents, and be idempotent', async () => {
        const db = mongoose.connection.db;
        const client = mongoose.connection.client;

        // 1. Seed unmigrated legacy documents directly using raw collection
        const accountsColl = db.collection('accounts');
        const legacyDoc = {
            id: 'legacy-1',
            name: 'Legacy User',
            email: 'legacy@example.com',
            balance: 500,
            deleted: false
        };
        await accountsColl.insertOne(legacyDoc);

        // 2. Check initial migration status
        const initialStatus = await migrateMongo.status(db);
        assert.ok(initialStatus.length > 0);
        assert.strictEqual(initialStatus[0].appliedAt, 'PENDING');

        // 3. Run migrations up
        const migrated = await migrateMongo.up(db, client);
        assert.strictEqual(migrated.length, 1);

        // 4. Verify document was updated with new schema fields
        const updatedDoc = await accountsColl.findOne({ id: 'legacy-1' });
        assert.strictEqual(updatedDoc.currency, 'USD');
        assert.strictEqual(updatedDoc.schemaVersion, 1);

        // 5. Verify changelog collection has recorded the migration
        const changelogColl = db.collection('changelog');
        const changelogEntry = await changelogColl.findOne({ fileName: migrated[0] });
        assert.ok(changelogEntry !== null && changelogEntry !== undefined);
        assert.ok(changelogEntry.appliedAt instanceof Date);

        // 6. Test IDEMPOTENCY: running up again should do nothing
        const secondRunMigrated = await migrateMongo.up(db, client);
        assert.strictEqual(secondRunMigrated.length, 0);

        // 7. Test ROLLBACK (down)
        const rolledBack = await migrateMongo.down(db, client);
        assert.strictEqual(rolledBack.length, 1);

        const docAfterRollback = await accountsColl.findOne({ id: 'legacy-1' });
        assert.strictEqual(docAfterRollback.currency, undefined);

        // Changelog entry should be removed
        const changelogAfterRollback = await changelogColl.findOne({ fileName: migrated[0] });
        assert.strictEqual(changelogAfterRollback, null);
    });
});
