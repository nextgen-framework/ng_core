# NextGen Core Framework

**Ultra-Minimal & Modular FiveM Framework**

Build RP, Racing, Creative, PvP, or anything else. Zero assumptions. Full control.

---

## 🎯 Philosophy

- **Ultra-Minimal Kernel** - Core = EventBus + Module Loader
- **3-Phase Loading** - Core → Modules → Plugins (guaranteed order)
- **Priority-Based** - Control initialization order (0-100+)
- **Zero Assumptions** - No jobs, money, inventory, or game mechanics
- **Auto-Detection** - External plugins discovered automatically
- **Client + Server** - Full symmetric architecture

---

## 🚀 Quick Start

### Installation

```bash
# 1. Place in resources folder
resources/[ng]/ng-core/

# 2. Add to server.cfg
ensure ng-core

# 3. Start server
```

### Verify

Look for this in console:

```
NextGen Core v1.0.0
Ultra-Generic & Dynamic

Phase 1: Initializing Core (EventBus)...
Phase 2: Loading Modules...
  ✓ resource-monitor (priority: 0)
  ✓ plugin-manager (priority: 1)
  ✓ rpc (priority: 5)
  ✓ player-manager (priority: 10)
  ✓ entity-manager (priority: 10)
  ✓ chat-commands (priority: 15)
  ✓ performance (priority: 20)
Phase 3: Loading Plugins...
Framework initialized successfully!
```

---

## 📦 What's Included

### Server Modules (7)
| Module | Priority | Purpose |
|--------|----------|---------|
| resource-monitor | 0 | Detects when all resources loaded |
| plugin-manager | 1 | Auto-detects external plugins |
| rpc | 5 | Bidirectional RPC (server ↔ client) |
| player-manager | 10 | Player pool with State Bags |
| entity-manager | 10 | Entity management |
| chat-commands | 15 | Commands with autocomplete |
| performance | 20 | Performance monitoring |

### Client Modules (5)
| Module | Priority | Purpose |
|--------|----------|---------|
| resource-monitor | 0 | Client resource detection |
| plugin-manager | 1 | Client plugin loading |
| rpc | 5 | Client RPC handlers |
| notifications | 15 | Notification system |
| performance | 20 | FPS monitor + overlay (F10) |

### Default Commands

```
/help [command]          - Show help (h, ?)
```

All other commands are provided by plugins (ng-demo, ng-test, or your own plugins).

---

## 🔌 Creating Plugins

### Structure

```
resources/[ng]/my-plugin/
├── ng-plugin.json      # Auto-detection marker
├── fxmanifest.lua      # FiveM manifest
├── server.js           # Server code
└── client.js           # Client code (optional)
```

### ng-plugin.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My awesome plugin",
  "entry": "server.js",
  "clientEntry": "client.js",
  "priority": 100,
  "ngCoreVersion": "^1.0.0"
}
```

### server.js

```javascript
class MyPlugin {
  constructor(framework) {
    this.framework = framework;
  }

  async init() {
    console.log('Plugin loaded!');

    // EventBus
    this.framework.eventBus.on('PLAYER_CONNECTED', (data) => {
      console.log('Player:', data.name);
    });

    // RPC
    this.framework.rpc.register('myRPC', (source) => {
      return { status: 'ok' };
    });

    // Command
    const chat = this.framework.getModule('chat-commands');
    chat.register('mycmd', (source, args) => {
      chat.sendMessage(source, 'Hello!');
    }, {
      description: 'My command'
    });
  }

  async destroy() {
    console.log('Plugin unloaded');
  }
}

module.exports = MyPlugin;
```

### client.js

```javascript
class MyPlugin {
  constructor(framework) {
    this.framework = framework;
  }

  async init() {
    // RPC
    this.framework.rpc.register('myClientRPC', () => {
      return { fps: GetFrameTime() };
    });

    // Notification
    const notif = this.framework.getModule('notifications');
    notif.info('Plugin loaded!');
  }

  async destroy() {}
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MyPlugin;
}
global.ClientPlugin_my_plugin = MyPlugin;
```

### fxmanifest.lua

```lua
fx_version 'cerulean'
game 'gta5'

server_scripts { 'server.js' }
client_scripts { 'client.js' }

dependency 'ng-core'
```

### Load It

```lua
# server.cfg
ensure ng-core
ensure my-plugin
```

**That's it!** Plugin auto-detected and loaded ✨

---

## 🛠️ Core API

### Framework Access

```javascript
// Server or Client
const framework = global.Framework;
```

### EventBus

```javascript
// Listen
framework.eventBus.on('MY_EVENT', (data) => {
  console.log(data);
});

// Emit
framework.eventBus.emit('MY_EVENT', { foo: 'bar' });
```

### RPC System

**Server → Client:**
```javascript
// Server: call client
const data = await framework.rpc.callClient('getClientInfo', source);

// Client: register handler
framework.rpc.register('getClientInfo', () => {
  return { fps: 60 };
});
```

**Client → Server:**
```javascript
// Client: call server
const money = await framework.rpc.callServer('getMoney');

// Server: register handler
framework.rpc.register('getMoney', (source) => {
  return { money: 5000 };
});
```

### Commands

```javascript
const chat = framework.getModule('chat-commands');

chat.register('mycommand', (source, args) => {
  chat.sendMessage(source, 'Hello!');
}, {
  description: 'My custom command',
  restricted: false,
  aliases: ['mycmd'],
  params: [
    { name: 'arg1', help: 'First argument' }
  ]
});
```

### Notifications (Client)

```javascript
const notif = framework.getModule('notifications');

notif.info('Info message');
notif.success('Success!');
notif.warning('Warning!');
notif.error('Error!');

// Advanced
notif.advanced('Title', 'Message', 'info', 5000);

// From server
framework.rpc.callClient('notify', source, 'Hello!', 'success');
```

### Player Manager (Server)

```javascript
const player = framework.getPlayer(source);

// State Bags (synced to client)
player.state.money = 5000;
player.state.set('job', 'police', true);

// Server-only data
player.setData('secret', 'abc');
```

### Resource Monitor

```javascript
const monitor = framework.getModule('resource-monitor');

// Check if all loaded
if (monitor.isAllResourcesLoaded()) {
  console.log('All ready!');
}

// Listen for event
framework.eventBus.on('ALL_RESOURCES_LOADED', () => {
  console.log('Everything loaded!');
});

// Get stats
const stats = monitor.getStats();
console.log(`${stats.started}/${stats.total} resources`);
```

---

## 🧪 Demo & Testing

### ng-demo
Complete demo plugin with:
- Commands: `/demo`, `/demomoney`, `/demoteleport`, `/demovehicle`
- UI: Press F9 (stats display), F10 (performance overlay)
- RPC examples, notifications, teleports, vehicles

```lua
ensure ng-demo
```

### ng-test
Automated test suite:
- 20+ server tests
- 22+ client tests
- Auto-runs after 5 seconds

```lua
ensure ng-test
```

---

## 📚 Documentation

Full docs in `/docs` folder:

- **[ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)** - Framework architecture
- **[MODULES.md](../../../docs/MODULES.md)** - Complete module API
- **[PLUGIN-GUIDE.md](../../../docs/PLUGIN-GUIDE.md)** - Plugin development
- **[CLIENT-SIDE.md](../../../docs/CLIENT-SIDE.md)** - Client framework
- **[TESTING.md](../../../docs/TESTING.md)** - Testing guide

---

## 🏗️ Architecture

### 3-Phase Loading

```
Phase 1: Core (Kernel)
   ├── EventBus
   └── Module Loader
        ↓
Phase 2: Modules
   ├── 0-9: Infrastructure (resource-monitor, plugin-manager)
   ├── 10-19: Framework (rpc, player-manager, chat-commands)
   └── 20+: Features (notifications, performance)
        ↓
Phase 3: Plugins
   └── 100+: External plugins (auto-detected)
```

### Priority Guide

| Range | Purpose | Examples |
|-------|---------|----------|
| 0-9 | Infrastructure | resource-monitor, plugin-manager |
| 10-19 | Framework | rpc, player-manager, chat-commands |
| 20-49 | Features | notifications, performance |
| 50-99 | Custom modules | Your modules |
| 100+ | Plugins | ng-demo, ng-test, your plugins |

---

## ⚙️ Configuration

### Server Convars (server.cfg)

```bash
# Framework debug mode
set ngcore_debug true

# Whitelist (disabled by default for development)
setr ngcore_whitelist_enabled "false"  # Set to "true" for production
```

### Module Configuration

Edit `src/core/shared/config.js`:

```javascript
const Config = {
  Name: 'NextGen Core',
  Version: '1.0.0',
  Debug: GetConvar('ngcore_debug', 'false') === 'true',

  // Server modules
  Modules: [
    { name: 'resource-monitor', priority: 0 },
    { name: 'plugin-manager', priority: 1 },
    { name: 'rpc', priority: 5 },
    { name: 'whitelist', priority: 8 },      // Optional: disabled by default
    { name: 'player-manager', priority: 10 },
    { name: 'entity-manager', priority: 10 },
    { name: 'chat-commands', priority: 15 },
    { name: 'performance', priority: 20 }
  ],

  // Client modules
  ClientModules: [
    { name: 'resource-monitor', priority: 0 },
    { name: 'plugin-manager', priority: 1 },
    { name: 'rpc', priority: 5 },
    { name: 'notifications', priority: 15 },
    { name: 'performance', priority: 20 }
  ]
};
```

### Whitelist Configuration

**Development (Default):**
```bash
# In server.cfg
setr ngcore_whitelist_enabled "false"
```

**Production:**
```bash
# In server.cfg
setr ngcore_whitelist_enabled "true"

# Add yourself to whitelist (in-game)
/wladd license:your_license_key
```

---

## 🌟 Why NextGen Core?

### vs ESX/QBCore

| Feature | NextGen | ESX/QB |
|---------|---------|--------|
| Philosophy | Zero-assumption | RP-focused |
| Built-in features | None (modular) | Jobs, money, inventory |
| Use cases | Any game mode | RP only |
| Module system | ✅ | ❌ |
| Plugin auto-detect | ✅ | ❌ |
| Client framework | ✅ | ⚠️ |
| Commands autocomplete | ✅ | ❌ |

### vs Custom

| Feature | NextGen | Custom |
|---------|---------|--------|
| Setup time | 5 minutes | Days/weeks |
| Boilerplate | Included | DIY |
| Module system | ✅ Built-in | ❌ Build it |
| Documentation | ✅ Complete | ❌ None |
| 3-Phase loading | ✅ | ❌ |

---

## 📄 License

Free to use and modify

---

## 🔗 Links

- **Demo**: `resources/[ng]/ng-demo/`
- **Tests**: `resources/[ng]/ng-test/`
- **Docs**: `/docs/`

---

**Version**: 1.0.0
**Framework**: NextGen Core
**Author**: NextGen Team

**Ultra-Minimal. Ultra-Flexible. Build Anything.** 🚀
