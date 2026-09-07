/**
 * Sample Production Migration: Backfill currency and schemaVersion
 * Demonstrates:
 * 1. Idempotency (only targets documents missing the fields)
 * 2. Memory safety (cursor streaming with batching rather than loading all into RAM)
 * 3. Atomic bulk updates via bulkWrite
 *
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db, client) => {
    const batchSize = 500;
    const collectionsToMigrate = ['accounts', 'transfers'];

    for (const collName of collectionsToMigrate) {
        const collection = db.collection(collName);
        
        // Find documents that do not yet have schemaVersion or currency
        const cursor = collection
            .find({
                $or: [
                    { schemaVersion: { $exists: false } },
                    { currency: { $exists: false } }
                ]
            })
            .project({ _id: 1 })
            .batchSize(batchSize);

        let bulkOps = [];

        for await (const doc of cursor) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: doc._id },
                    update: {
                        $set: {
                            currency: 'USD',
                            schemaVersion: 1
                        }
                    }
                }
            });

            if (bulkOps.length >= batchSize) {
                await collection.bulkWrite(bulkOps, { ordered: false });
                bulkOps = [];
            }
        }

        if (bulkOps.length > 0) {
            await collection.bulkWrite(bulkOps, { ordered: false });
        }
    }
};

/**
 * Rollback Migration
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db, client) => {
    const collectionsToRollback = ['accounts', 'transfers'];

    for (const collName of collectionsToRollback) {
        const collection = db.collection(collName);
        await collection.updateMany(
            { currency: 'USD' },
            {
                $unset: { currency: '' }
            }
        );
    }
};
