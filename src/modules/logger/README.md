# Logger Module

Unified logging system with multiple output destinations (console, database, Discord).

## Features

- ✅ Multiple log levels (trace, debug, info, warn, error, fatal)
- ✅ Colored console output
- ✅ Database logging (buffered for performance)
- ✅ Discord webhook integration
- ✅ Configurable log levels and outputs
- ✅ Query logs from database
- ✅ Auto-cleanup of old logs

## Usage

### Basic Logging

```javascript
const logger = framework.getModule('logger');

// Different log levels
logger.trace('Detailed trace information');
logger.debug('Debug information');
logger.info('General information');
logger.success('Operation successful');
logger.warn('Warning message');
logger.error('Error occurred');
logger.fatal('Critical error');
```

### Logging with Metadata

```javascript
logger.info('Player connected', {
  player: playerName,
  identifier: license,
  ip: endpoint
});

logger.error('Database query failed', {
  query: sql,
  error: error.message,
  params: queryParams
});
```

### Configuration

```javascript
// Configure at init
async init() {
  const logger = framework.getModule('logger');

  logger.configure({
    level: 'debug',              // Minimum log level
    outputs: ['console', 'database', 'discord'],
    discordWebhook: 'https://discord.com/api/webhooks/...',
    databaseOutput: true,
    colorize: true
  });
}

// Change log level at runtime
logger.setLevel('warn'); // Only show warnings and above

// Enable/disable outputs
logger.enableOutput('discord');
logger.disableOutput('console');
```

### Query Logs

```javascript
// Get recent errors
const errors = await logger.getLogs({
  level: 'error',
  since: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
  limit: 50
});

// Get logs for specific resource
const resourceLogs = await logger.getLogs({
  resource: 'ng_core',
  limit: 100
});

// Get logs in date range
const logs = await logger.getLogs({
  since: new Date('2024-01-01').getTime(),
  until: new Date('2024-01-31').getTime()
});
```

### Cleanup

```javascript
// Delete logs older than 30 days
const deleted = await logger.clearOldLogs(30);
console.log(`Deleted ${deleted} old logs`);
```

## Log Levels

| Level | Value | Description | Console | Database | Discord |
|-------|-------|-------------|---------|----------|---------|
| trace | 0 | Very detailed debugging | ✅ | ✅ | ❌ |
| debug | 1 | Debugging information | ✅ | ✅ | ❌ |
| info | 2 | General information | ✅ | ✅ | ❌ |
| success | 2 | Success messages | ✅ | ✅ | ❌ |
| warn | 3 | Warning messages | ✅ | ✅ | ✅ |
| error | 4 | Error messages | ✅ | ✅ | ✅ |
| fatal | 5 | Critical errors | ✅ | ✅ | ✅ |

Set minimum level:
```javascript
logger.setLevel('warn'); // Only show warn, error, fatal
```

## Output Destinations

### Console Output

Colored console output with timestamps:

```
[14:23:45] [ng_core] INFO    Player connected {"name":"John","id":1}
[14:23:50] [ng_core] WARN    Low memory warning
[14:23:55] [ng_core] ERROR   Database connection failed
```

### Database Output

Logs are buffered and inserted in batches for performance:
- Buffer size: 50 logs
- Flush interval: 30 seconds
- Auto-flush on buffer full

Logs are stored in `logs` collection:
```javascript
{
  level: 'error',
  message: 'Database query failed',
  resource: 'ng_core',
  metadata: { query: 'SELECT...', error: '...' },
  timestamp: 1234567890,
  _created_at: '2024-01-15T14:23:45.123Z'
}
```

### Discord Webhook Output

Only sends important logs (warn, error, fatal) to Discord with embedded format:

```javascript
logger.configure({
  discordWebhook: 'https://discord.com/api/webhooks/your-webhook-url'
});

logger.error('Server error', {
  code: 500,
  endpoint: '/api/players'
});
// Sends to Discord with colored embed
```

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// DON'T: Log everything as error
logger.error('Player joined'); // Wrong

// DO: Use appropriate levels
logger.info('Player joined');
logger.warn('Player inventory full');
logger.error('Failed to save player data');
```

### 2. Include Useful Metadata

```javascript
// DON'T: Vague messages
logger.error('Error occurred');

// DO: Specific messages with context
logger.error('Failed to save vehicle', {
  plate: 'ABC123',
  error: error.message,
  playerId: source
});
```

### 3. Use Structured Logging

```javascript
// DON'T: String concatenation
logger.info(`Player ${name} bought ${item} for ${price}`);

// DO: Structured metadata
logger.info('Player purchased item', {
  player: name,
  item: item,
  price: price,
  transaction_id: txId
});
```

### 4. Don't Log Sensitive Data

```javascript
// DON'T: Log passwords, tokens, etc.
logger.debug('User login', {
  username: user,
  password: pass // NEVER log passwords!
});

// DO: Sanitize sensitive data
logger.debug('User login', {
  username: user,
  passwordLength: pass.length // Log length, not content
});
```

### 5. Use Debug Level for Development

```javascript
// Development
logger.setLevel('debug');
logger.debug('Processing player data', { playerId, data });

// Production
logger.setLevel('info');
// Debug logs won't be shown
```

## Integration Examples

### In Modules

```javascript
class MyModule {
  constructor(framework) {
    this.framework = framework;
    this.logger = null;
  }

  async init() {
    this.logger = this.framework.getModule('logger');

    this.logger.info('MyModule initialized');
  }

  async doSomething() {
    try {
      this.logger.debug('Starting operation');

      // ... operation code ...

      this.logger.success('Operation completed');
    } catch (error) {
      this.logger.error('Operation failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}
```

### In Plugins

```javascript
class MyPlugin {
  constructor(framework) {
    this.framework = framework;
    this.logger = framework.getModule('logger');
  }

  async init() {
    this.logger.info('MyPlugin loading...');

    // Plugin initialization

    this.logger.success('MyPlugin loaded successfully');
  }

  async onPlayerJoin(source) {
    const player = this.framework.getPlayer(source);

    this.logger.info('Player joined', {
      source,
      name: player.getName(),
      license: player.getIdentifier('license')
    });
  }
}
```

### Performance Monitoring

```javascript
class PerformanceMonitor {
  async monitorFunction(name, fn) {
    const logger = this.framework.getModule('logger');
    const start = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn(`Slow operation: ${name}`, { duration });
      } else {
        logger.debug(`Operation: ${name}`, { duration });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Operation failed: ${name}`, {
        duration,
        error: error.message
      });
      throw error;
    }
  }
}
```

## Configuration Options

```javascript
logger.configure({
  // Minimum log level to display
  level: 'info', // trace, debug, info, warn, error, fatal

  // Output destinations
  outputs: ['console', 'database', 'discord'],

  // Discord webhook URL
  discordWebhook: 'https://discord.com/api/webhooks/...',

  // Enable database output
  databaseOutput: true,

  // Console formatting
  includeTimestamp: true,
  includeLevel: true,
  colorize: true
});
```

## Maintenance

### Cleanup Command

Create a command to clean old logs:

```javascript
chatCommands.register('cleanlogs', async (source, args) => {
  const logger = framework.getModule('logger');
  const days = parseInt(args[0]) || 30;

  const deleted = await logger.clearOldLogs(days);
  chatCommands.sendMessage(source, `Deleted ${deleted} logs older than ${days} days`);
}, {
  description: 'Clean old logs',
  restricted: 'admin'
});
```

### View Logs Command

```javascript
chatCommands.register('logs', async (source, args) => {
  const logger = framework.getModule('logger');
  const level = args[0] || null;

  const logs = await logger.getLogs({
    level,
    limit: 10
  });

  chatCommands.sendMessage(source, `=== Recent ${level || 'all'} logs ===`);
  logs.forEach(log => {
    chatCommands.sendMessage(source,
      `[${log.level}] ${log.message} - ${log.resource}`
    );
  });
}, {
  description: 'View recent logs',
  restricted: 'admin'
});
```

## Performance

- **Buffered database writes**: Logs are batched (50 at a time)
- **Async operations**: Database and Discord outputs are non-blocking
- **Minimal console overhead**: Only formats logs that will be shown
- **Auto-cleanup**: Old logs can be automatically deleted

## Troubleshooting

### Logs not appearing in database

Check database module is loaded:
```javascript
const db = framework.database;
if (!db) {
  console.error('Database module not loaded');
}
```

### Discord webhook not working

Test webhook URL:
```javascript
await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'Test message'
  })
});
```

### Too many logs

Increase minimum log level:
```javascript
logger.setLevel('warn'); // Only warnings and above
```

Or disable outputs:
```javascript
logger.disableOutput('database');
logger.disableOutput('discord');
```
