/**
 * Migration: Move Account reference to Account model (Account.userId -> User.id)
 * and remove accountId from User model.
 * 
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db, client) => {
  const usersColl = db.collection('users');
  const accountsColl = db.collection('accounts');

  const usersWithAccount = await usersColl.find({
    accountId: { $exists: true, $ne: null }
  }).toArray();

  for (const user of usersWithAccount) {
    await accountsColl.updateOne(
      { id: user.accountId },
      { $set: { userId: user.id } }
    );
  }

  // Remove accountId field from users collection
  await usersColl.updateMany(
    { accountId: { $exists: true } },
    { $unset: { accountId: "" } }
  );
};

/**
 * Rollback migration: Restore User.accountId from Account.userId and remove Account.userId.
 * 
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db, client) => {
  const usersColl = db.collection('users');
  const accountsColl = db.collection('accounts');

  const accountsWithUser = await accountsColl.find({
    userId: { $exists: true, $ne: null }
  }).toArray();

  for (const account of accountsWithUser) {
    await usersColl.updateOne(
      { id: account.userId },
      { $set: { accountId: account.id } }
    );
  }

  // Remove userId field from accounts collection
  await accountsColl.updateMany(
    { userId: { $exists: true } },
    { $unset: { userId: "" } }
  );
};
