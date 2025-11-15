# Contributing to NextGen Core

Thank you for your interest in contributing to the NextGen Core framework!

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other contributors

## Getting Started

### Prerequisites

- Node.js 18+ (for development tools)
- FiveM Server (for testing)
- Git
- Basic knowledge of JavaScript and FiveM scripting

### Setup Development Environment

1. Fork the repository
2. Clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/ng-core.git
cd ng-core
```

3. Install dependencies:
```bash
yarn install
```

4. Create a branch:
```bash
git checkout -b feature/your-feature-name
```

## Development Guidelines

### Code Style

- Follow `.editorconfig` settings
- Run ESLint before committing: `yarn lint`
- Use 2 spaces for indentation
- Use single quotes for strings
- Add semicolons
- Use `const` by default, `let` when reassignment needed
- Never use `var`

### Naming Conventions

**Files**:
- Module files: `module-name/server.js`, `module-name/client.js`
- Shared files: `module-name/shared.js`
- Lowercase with hyphens

**Variables/Functions**:
- camelCase for variables and functions
- PascalCase for classes
- UPPER_CASE for constants

**Examples**:
```javascript
// Good
const playerManager = framework.getModule('player-manager');
class PlayerManager { }
const MAX_PLAYERS = 128;

// Bad
const PlayerManager = framework.getModule('player-manager');
class player_manager { }
const maxPlayers = 128;
```

### Module Structure

Each module should follow this structure:

```
src/modules/your-module/
├── server.js        # Server-side code (required)
├── client.js        # Client-side code (optional)
├── shared.js        # Shared code (optional)
└── README.md        # Module documentation (recommended)
```

**Module Template**:
```javascript
/**
 * Module Name - Brief description
 * Priority: XX (where it loads in sequence)
 */
class ModuleName {
  constructor(framework) {
    this.framework = framework;
    this.name = 'module-name';
  }

  /**
   * Initialize the module
   */
  async init() {
    console.log(`[${this.name}] Initializing...`);
    // Your init code here
  }

  /**
   * Clean up on shutdown
   */
  async destroy() {
    console.log(`[${this.name}] Shutting down...`);
    // Cleanup code here
  }
}

module.exports = ModuleName;
```

### Priority Guidelines

When adding a new module, choose the appropriate priority:

| Priority | Purpose | Examples |
|----------|---------|----------|
| 0-9 | Infrastructure | resource-monitor, plugin-manager |
| 10-19 | Core framework | rpc, player-manager, chat-commands |
| 20-49 | Features | notifications, performance |
| 50-99 | Custom modules | Your additions |

### Adding a New Module

1. **Create module directory**:
```bash
mkdir src/modules/your-module
```

2. **Create server.js** (or client.js):
```javascript
// Use the module template above
```

3. **Update config.js**:
```javascript
// In src/core/shared/config.js
Modules: [
  // ... existing modules
  { name: 'your-module', priority: 50 }
]
```

4. **Update fxmanifest.lua**:
```lua
-- Server modules
server_scripts {
  -- ... existing
  'src/modules/your-module/server.js'
}
```

5. **Add documentation**:
```bash
# Create README.md in your module folder
```

### Database Migrations

When adding database changes:

1. **Create migration file**:
```bash
# In src/modules/database/migrations/
touch 008_your_migration_name.sql
```

2. **Follow naming convention**: `NNN_description.sql`
   - `NNN`: Sequential number (001, 002, etc.)
   - `description`: Brief description with underscores

3. **Write idempotent SQL**:
```sql
-- Good: Check if exists
CREATE TABLE IF NOT EXISTS your_table (
  id INT PRIMARY KEY AUTO_INCREMENT
);

-- Good: Safe alter
ALTER TABLE your_table
ADD COLUMN IF NOT EXISTS new_column VARCHAR(50);

-- Bad: Will fail on re-run
CREATE TABLE your_table (...);
```

4. **Test migration**:
```bash
# Drop database and restart server to test migration
```

## Testing

### Manual Testing

1. **Start test environment**:
```bash
# In FiveM server directory
ensure ng-core
ensure ng-test
```

2. **Check console for errors**:
   - Server console: Look for red errors
   - Client console (F8): Check for errors

3. **Run test suite**:
```bash
ensure ng-test  # Auto-runs tests after 5 seconds
```

### What to Test

- [ ] Module loads without errors
- [ ] Module initializes in correct priority order
- [ ] EventBus events work correctly
- [ ] RPC calls function properly (if applicable)
- [ ] Commands work (if applicable)
- [ ] No memory leaks (check with `/perf`)
- [ ] Compatible with existing modules

### Performance Testing

Use the performance module to check impact:

```lua
# In-game
/perf  # Shows performance stats
```

Check:
- Tick time should stay low (<5ms)
- No significant FPS drops
- Memory usage reasonable

## Documentation

### Code Comments

Add JSDoc comments for public methods:

```javascript
/**
 * Get a player by source ID
 * @param {number} source - Player source ID
 * @returns {Object|null} Player object or null if not found
 */
getPlayer(source) {
  return this.players.get(source);
}
```

### README Updates

When adding features:

1. Update main README.md
2. Add module to module list
3. Update API examples (if applicable)
4. Add to Quick Start (if user-facing)

## Committing Changes

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature or module
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Scopes** (optional):
- Module name: `player-manager`, `rpc`, `database`
- Area: `core`, `client`, `server`

**Examples**:
```
feat(player-manager): add getPlayerByIdentifier method
fix(rpc): handle timeout in callClient
docs(readme): update RPC examples
perf(zone-manager): optimize polygon detection
refactor(core): extract event bus to separate file
```

### Pull Request Process

1. **Update documentation**:
   - README.md (if adding features)
   - Code comments
   - Module README (if creating module)

2. **Run linter**:
```bash
yarn lint
```

3. **Test thoroughly**:
   - Start server with your changes
   - Run ng-test
   - Test manually

4. **Commit changes**:
```bash
git add .
git commit -m "feat(module): description"
```

5. **Push and create PR**:
```bash
git push origin feature/your-feature-name
# Then create PR on GitHub
```

### Pull Request Checklist

- [ ] Code follows style guidelines
- [ ] ESLint passes (`yarn lint`)
- [ ] All tests pass (ng-test)
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] No breaking changes (or documented)
- [ ] No sensitive data committed

## Breaking Changes

If your PR introduces breaking changes:

1. **Mark in commit message**:
```
feat(module)!: breaking change description

BREAKING CHANGE: Explain what changed and migration path
```

2. **Document migration**:
   - What changed
   - Why it changed
   - How to migrate existing code

3. **Update version** (if you have permissions)

## Security

### Reporting Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Contact maintainers privately with:
- Detailed description
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Best Practices

- Never commit credentials or API keys
- Validate all user input
- Use parameterized SQL queries
- Check permissions before executing admin commands
- Rate limit sensitive operations

## Questions?

- Check existing issues
- Read the documentation thoroughly
- Ask in discussions (if enabled)
- Open an issue with `question` label

## Recognition

Contributors will be:
- Listed in contributors section
- Credited in release notes
- Acknowledged in documentation

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

**Thank you for making NextGen Core better!** 🚀
