# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: [ADD YOUR SECURITY EMAIL]

Include:
- Type of vulnerability
- Affected files/modules
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 48 hours.

## Security Considerations

### Input Validation

All modules that accept user input should validate it:

```javascript
// Good - Validate input
if (typeof amount !== 'number' || amount < 0) {
  throw new Error('Invalid amount');
}

// Bad - No validation
player.money += amount;
```

### SQL Injection

Always use parameterized queries:

```javascript
// Good - Parameterized
await db.execute('SELECT * FROM users WHERE id = ?', [userId]);

// Bad - String concatenation
await db.execute(`SELECT * FROM users WHERE id = ${userId}`);
```

### Command Permissions

Always check permissions for admin commands:

```javascript
// Good - Permission check
if (!IsPlayerAceAllowed(source, 'command.admin')) {
  return;
}

// Bad - No permission check
RegisterCommand('giveweapon', (source, args) => {
  // Anyone can execute
});
```

### RPC Security

Validate RPC calls and implement rate limiting:

```javascript
// Good - Validation
rpc.register('giveMoney', (source, amount) => {
  if (typeof amount !== 'number' || amount > 10000) {
    throw new Error('Invalid amount');
  }
  // Process...
});

// Bad - No validation
rpc.register('giveMoney', (source, amount) => {
  player.money += amount; // Can be exploited
});
```

### EventBus Security

Don't trust client events for critical operations:

```javascript
// Bad - Client can trigger this
onNet('player:setMoney', (amount) => {
  player.money = amount; // Client can cheat
});

// Good - Server-side only
eventBus.on('PLAYER_EARNED_MONEY', (data) => {
  player.money += data.amount;
});
```

## Best Practices for Module Developers

### 1. Validate All Input

```javascript
function setPlayerMoney(source, amount) {
  // Type check
  if (typeof amount !== 'number') {
    throw new TypeError('Amount must be a number');
  }

  // Range check
  if (amount < 0 || amount > 1000000) {
    throw new RangeError('Amount out of valid range');
  }

  // Proceed with validated input
  player.money = amount;
}
```

### 2. Use Database Safely

```javascript
// Always use parameterized queries
const Collection = require('./collection');
const users = new Collection('users', db);

// Safe - Parameters are escaped
await users.findOne({ id: userId });

// Safe - Update with parameters
await users.update({ id: userId }, { money: newAmount });
```

### 3. Rate Limit Sensitive Operations

```javascript
const rateLimits = new Map();

function isRateLimited(source, action, maxCalls = 5, windowMs = 60000) {
  const key = `${source}:${action}`;
  const now = Date.now();
  const record = rateLimits.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }

  record.count++;
  rateLimits.set(key, record);

  return record.count > maxCalls;
}

// Usage
rpc.register('expensiveOperation', (source) => {
  if (isRateLimited(source, 'expensiveOp')) {
    throw new Error('Rate limit exceeded');
  }
  // Process...
});
```

### 4. Sanitize Output

```javascript
// When displaying user input
function sanitizeString(str) {
  return String(str)
    .replace(/[<>]/g, '') // Remove HTML tags
    .substring(0, 200); // Limit length
}

// Usage
chatCommands.sendMessage(source, sanitizeString(userMessage));
```

### 5. Don't Expose Sensitive Data

```javascript
// Bad - Exposes internal data
rpc.register('getPlayer', (source, targetId) => {
  return players.get(targetId); // Full object with sensitive data
});

// Good - Only necessary data
rpc.register('getPlayer', (source, targetId) => {
  const player = players.get(targetId);
  return {
    id: player.id,
    name: player.name
    // Don't include: identifiers, IP, etc.
  };
});
```

## Common Vulnerabilities to Avoid

### 1. Command Injection

```javascript
// Bad - Command injection risk
exec(`player_command ${playerInput}`);

// Good - Use safe APIs
emitNet('playerCommand', source, sanitizedInput);
```

### 2. Path Traversal

```javascript
// Bad - Path traversal
const filePath = `./data/${userId}.json`;

// Good - Validate path
const filePath = path.join('./data', path.basename(`${userId}.json`));
```

### 3. Prototype Pollution

```javascript
// Bad - Can pollute Object prototype
function merge(target, source) {
  for (let key in source) {
    target[key] = source[key];
  }
}

// Good - Check hasOwnProperty
function merge(target, source) {
  for (let key in source) {
    if (source.hasOwnProperty(key) && key !== '__proto__') {
      target[key] = source[key];
    }
  }
}
```

### 4. Resource Exhaustion

```javascript
// Bad - Can cause DoS
const data = JSON.parse(untrustedInput); // Huge payload crashes server

// Good - Limit size
if (untrustedInput.length > 10000) {
  throw new Error('Payload too large');
}
const data = JSON.parse(untrustedInput);
```

## Security Checklist for PRs

Before submitting a PR, verify:

- [ ] All user input is validated
- [ ] SQL queries use parameters (no string concatenation)
- [ ] Commands check permissions
- [ ] RPC handlers validate input
- [ ] No sensitive data in logs
- [ ] No hardcoded credentials
- [ ] Rate limiting for sensitive operations
- [ ] Client events are not trusted for critical operations
- [ ] Error messages don't expose system details

## Dependency Security

### Audit Dependencies

```bash
# Check for vulnerabilities
yarn audit

# Fix vulnerabilities
yarn audit --fix
```

### Update Dependencies

```bash
# Update all dependencies
yarn upgrade

# Update specific package
yarn upgrade package-name
```

## Incident Response

If you discover a security issue in production:

1. **Immediate**: Disable affected functionality
2. **Investigate**: Determine scope and impact
3. **Fix**: Apply patch or workaround
4. **Notify**: Inform affected users (if applicable)
5. **Learn**: Document and improve processes

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [FiveM Security Best Practices](https://docs.fivem.net/docs/scripting-manual/security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Last Updated**: 2025-01-15
