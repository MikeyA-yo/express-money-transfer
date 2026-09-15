/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db, client) => {
    // const collections = ['transfers', 'accounts'];
    // for (const collName of collections) {
    //     const collection = db.collection(collName);
        
    // }
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const migrationConfig = {
    'transfers': 'amount', 
    'accounts': 'balance' 
  };

  for (const [collName, fieldPath] of Object.entries(migrationConfig)) {
    const collection = db.collection(collName);
    
    await collection.updateMany(
      { [fieldPath]: { $type: "decimal" } }, 
      [
        {
          $set: {
            [fieldPath]: { 
              // Convert to 64-bit Int after multiplying by 100 to get minor units
              $toLong: { $multiply: [`$${fieldPath}`, 100] } 
            }
          }
        }
      ]
    );
  }
};

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db, client) => {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
    const migrationConfig = {
    'transfers': 'amount', 
    'accounts': 'balance'
  };

  for (const [collName, fieldPath] of Object.entries(migrationConfig)) {
    const collection = db.collection(collName);
    
    await collection.updateMany(
      { [fieldPath]: { $type: "long" } }, 
      [
        {
          $set: {
            [fieldPath]: { 
              $toDecimal: { $divide: [`$${fieldPath}`, 100] } 
            }
          }
        }
      ]
    );
  }
};
