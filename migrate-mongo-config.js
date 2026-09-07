import 'dotenv/config';

const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/express-money-transfer';

let databaseName;
try {
  const parsed = new URL(mongoUrl);
  const dbFromPath = parsed.pathname.replace(/^\//, '');
  if (dbFromPath) {
    databaseName = dbFromPath;
  }
} catch {
  // In case of special connection strings, client.db(undefined) will resolve default db
}

const config = {
  mongodb: {
    url: mongoUrl,
    databaseName: databaseName,
    options: {}
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  lockTtl: 0,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm'
};

export default config;
