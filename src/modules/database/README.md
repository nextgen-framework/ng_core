# Database Module

The Database Module provides a powerful abstraction layer over MySQL using oxmysql, with a MongoDB-like Collection API for flexible data models while maintaining high performance.

## Features

- **MySQL + oxmysql**: 3-5x faster than generic MySQL drivers
- **Collection API**: MongoDB-like API (`insert`, `find`, `update`, `delete`)
- **Raw SQL Support**: Direct SQL queries when needed
- **Transactions**: ACID-compliant transaction support
- **Migrations**: Automatic schema versioning and migrations
- **Plugin-Friendly**: Easy to use from external plugins

## Installation

1. Add `oxmysql` to your server dependencies
2. Configure MySQL connection in `server.cfg`:

```cfg
set mysql_connection_string "mysql://user:password@localhost/database"
```

3. The module loads automatically as Layer 0 (Foundation)

## Usage

### Access Database from Framework

```javascript
// In your plugin or module
const db = this.framework.database; // or this.framework.db
```

### Collection API (MongoDB-like)

#### Insert Documents

```javascript
const users = db.collection('users');

// Insert single document
const userId = await users.insert({
  username: 'john_doe',
  email: 'john@example.com',
  level: 1,
  money: 5000
});

// Insert multiple documents
await users.insertMany([
  { username: 'user1', level: 1 },
  { username: 'user2', level: 2 }
]);
```

#### Find Documents

```javascript
// Find all
const allUsers = await users.find();

// Find with query
const richUsers = await users.find({ money: { $gte: 10000 } });

// Find one
const user = await users.findOne({ username: 'john_doe' });

// Find by ID
const user = await users.findById(123);

// Find with sorting and limit
const topUsers = await users.find(
  { level: { $gte: 5 } },
  { sort: { money: -1 }, limit: 10 }
);
```

#### Update Documents

```javascript
// Update by ID
await users.updateById(123, {
  $set: { level: 2 },
  $inc: { money: 1000 }
});

// Update one matching query
await users.updateOne(
  { username: 'john_doe' },
  { $set: { email: 'newemail@example.com' } }
);

// Update multiple
await users.update(
  { level: 1 },
  { $inc: { level: 1 } }
);
```

#### Delete Documents

```javascript
// Delete by ID
await users.deleteById(123);

// Delete one
await users.deleteOne({ username: 'john_doe' });

// Delete multiple
await users.delete({ level: { $lt: 5 } });

// Delete all
await users.deleteAll();
```

#### Count & Exists

```javascript
// Count all
const total = await users.count();

// Count with query
const activeCount = await users.count({ active: true });

// Check if exists
const hasAdmin = await users.exists({ role: 'admin' });
```

### Query Operators

- `$eq`: Equal (default)
- `$ne`: Not equal
- `$gt`: Greater than
- `$gte`: Greater than or equal
- `$lt`: Less than
- `$lte`: Less than or equal

```javascript
await users.find({
  level: { $gte: 5, $lt: 10 },
  money: { $gt: 5000 }
});
```

### Update Operators

- `$set`: Set field value
- `$inc`: Increment field value
- `$unset`: Remove field

```javascript
await users.update({ username: 'john_doe' }, {
  $set: { email: 'new@example.com' },
  $inc: { money: 1000, level: 1 },
  $unset: { temporary_field: true }
});
```

### Raw SQL Queries

For complex queries, use raw SQL:

```javascript
// Query with results
const results = await db.query(
  'SELECT * FROM users WHERE level > ? ORDER BY money DESC LIMIT ?',
  [5, 10]
);

// Execute without results
const result = await db.execute(
  'UPDATE users SET level = level + 1 WHERE money > ?',
  [100000]
);
console.log(`Updated ${result.affectedRows} rows`);

// Single result
const topUser = await db.scalar(
  'SELECT * FROM users ORDER BY money DESC LIMIT 1'
);
```

### Transactions

For atomic operations:

```javascript
await db.transaction(async (connection) => {
  // All queries here are part of the transaction
  await users.updateById(senderId, { $inc: { money: -1000 } });
  await users.updateById(receiverId, { $inc: { money: 1000 } });

  // Transaction commits automatically
  // Rolls back automatically on error
});
```

### Indexes

Create indexes for better query performance:

```javascript
const items = db.collection('items');

// Regular index
await items.createIndex('name');

// Unique index
await items.createIndex('identifier', { unique: true });

// Drop index
await items.dropIndex('name');
```

## Collection vs Traditional Tables

### Collections (Flexible Schema)

Collections store data as JSON in a `data` column:

```javascript
const logs = db.collection('game_logs');
await logs.insert({
  type: 'player_action',
  player: 'john_doe',
  action: 'kill',
  // Any structure you want!
});
```

**Use collections for:**
- Plugin-specific data
- Flexible/dynamic schemas
- Rapid prototyping
- Log storage

### Traditional Tables (Structured Schema)

Use migrations for structured data with relations:

```sql
-- In migrations/001_schema.sql
CREATE TABLE players (
  id INT PRIMARY KEY AUTO_INCREMENT,
  identifier VARCHAR(255) UNIQUE,
  name VARCHAR(255)
);
```

**Use traditional tables for:**
- Core framework data (players, characters, vehicles)
- Data with foreign key relationships
- Strict data validation
- Complex JOINs

## Migrations

Migrations are auto-executed on framework startup.

### SQL Migration

Create `migrations/002_add_vehicles.sql`:

```sql
CREATE TABLE vehicles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plate VARCHAR(20) UNIQUE,
  model VARCHAR(50),
  owner_id INT,
  FOREIGN KEY (owner_id) REFERENCES players(id)
);
```

### JavaScript Migration

Create `migrations/003_seed_data.js`:

```javascript
module.exports = {
  async up(db) {
    const orgs = db.collection('organizations');
    await orgs.insertMany([
      { name: 'police', label: 'LSPD' },
      { name: 'hospital', label: 'EMS' }
    ]);
  }
};
```

Migrations are tracked in the `migrations` table and only run once.

## Plugin Usage Example

```javascript
class MyPlugin {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
  }

  async init() {
    // Create plugin-specific collections
    this.logs = this.db.collection('myplugin_logs');
    this.config = this.db.collection('myplugin_config');

    // Insert initial config if not exists
    const hasConfig = await this.config.exists({ key: 'version' });
    if (!hasConfig) {
      await this.config.insert({ key: 'version', value: '1.0.0' });
    }
  }

  async logAction(playerId, action) {
    await this.logs.insert({
      player_id: playerId,
      action: action,
      timestamp: Date.now()
    });
  }

  async getPlayerLogs(playerId) {
    return await this.logs.find(
      { player_id: playerId },
      { sort: { _created_at: -1 }, limit: 50 }
    );
  }
}
```

## Performance Tips

1. **Use indexes** for frequently queried fields
2. **Use raw SQL** for complex JOINs and aggregations
3. **Use transactions** for multi-step operations
4. **Use traditional tables** for relational data
5. **Use collections** for flexible/dynamic data
6. **Batch operations** when possible (`insertMany`, `update`)

## API Reference

### Database Class

- `db.query(sql, params)` - Execute SQL query
- `db.execute(sql, params)` - Execute SQL statement
- `db.scalar(sql, params)` - Execute query, return first row
- `db.transaction(callback)` - Execute transaction
- `db.collection(name)` - Get/create collection
- `db.dropCollection(name)` - Drop collection
- `db.listCollections()` - List all collections
- `db.isConnected()` - Check connection status

### Collection Class

- `insert(doc)` - Insert document
- `insertMany(docs)` - Insert multiple documents
- `find(query, options)` - Find documents
- `findOne(query)` - Find single document
- `findById(id)` - Find by ID
- `update(query, update)` - Update documents
- `updateOne(query, update)` - Update single document
- `updateById(id, update)` - Update by ID
- `delete(query)` - Delete documents
- `deleteOne(query)` - Delete single document
- `deleteById(id)` - Delete by ID
- `deleteAll()` - Delete all documents
- `count(query)` - Count documents
- `exists(query)` - Check if documents exist
- `createIndex(field, options)` - Create index
- `dropIndex(field)` - Drop index

## Reserved Fields

Collections automatically add these fields:

- `_id`: Document ID (auto-increment)
- `_created_at`: Creation timestamp
- `_updated_at`: Last update timestamp

Access these in queries:

```javascript
await users.find({ _created_at: { $gte: '2024-01-01' } });
```

## Configuration

In your config:

```javascript
Config.database = {
  autoMigrate: true, // Run migrations on startup (default: true)
};
```

## Troubleshooting

### "Database not connected"

Ensure oxmysql is installed and configured in `server.cfg`:
```cfg
ensure oxmysql
set mysql_connection_string "mysql://user:password@localhost/database"
```

### "Collection not found"

Collections are auto-created. Ensure the database module is loaded before accessing collections.

### Migration failed

Check the migration SQL/JS syntax. Failed migrations prevent framework startup.
