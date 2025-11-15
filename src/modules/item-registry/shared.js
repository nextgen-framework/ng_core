/**
 * NextGen Framework - Item Registry (Shared)
 * Central registry for all items in the game
 */

class ItemRegistry {
  constructor(framework) {
    this.framework = framework;
    this.items = new Map(); // itemId => ItemDefinition
    this.categories = new Map(); // category => Set(itemIds)
  }

  /**
   * Initialize item registry
   */
  init() {
    // Register default items
    this.registerDefaultItems();

    console.log(`[Item Registry] Initialized with ${this.items.size} items`);
  }

  /**
   * Register an item
   */
  registerItem(itemId, definition) {
    const item = {
      id: itemId,
      name: definition.name || itemId,
      description: definition.description || '',
      category: definition.category || 'misc',
      weight: definition.weight || 0,
      stackable: definition.stackable !== false,
      maxStack: definition.maxStack || 100,
      usable: definition.usable || false,
      consumable: definition.consumable || false,
      tradeable: definition.tradeable !== false,
      destroyable: definition.destroyable !== false,
      metadata: definition.metadata || {},
      image: definition.image || null,
      model: definition.model || null,
      ...definition
    };

    this.items.set(itemId, item);

    // Add to category
    if (!this.categories.has(item.category)) {
      this.categories.set(item.category, new Set());
    }
    this.categories.get(item.category).add(itemId);

    return item;
  }

  /**
   * Register multiple items
   */
  registerItems(items) {
    for (const [itemId, definition] of Object.entries(items)) {
      this.registerItem(itemId, definition);
    }
  }

  /**
   * Get item definition
   */
  getItem(itemId) {
    return this.items.get(itemId) || null;
  }

  /**
   * Get all items
   */
  getAllItems() {
    return Array.from(this.items.values());
  }

  /**
   * Get items by category
   */
  getItemsByCategory(category) {
    const itemIds = this.categories.get(category);
    if (!itemIds) return [];

    return Array.from(itemIds).map(id => this.items.get(id)).filter(Boolean);
  }

  /**
   * Check if item exists
   */
  hasItem(itemId) {
    return this.items.has(itemId);
  }

  /**
   * Get all categories
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * Search items by name
   */
  searchItems(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAllItems().filter(item =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Register default items
   */
  registerDefaultItems() {
    // Basic items
    this.registerItems({
      // Money
      'money': {
        name: 'Cash',
        description: 'Paper money',
        category: 'currency',
        weight: 0,
        stackable: true,
        maxStack: 999999,
        usable: false,
        tradeable: true
      },
      'black_money': {
        name: 'Dirty Money',
        description: 'Unmarked bills',
        category: 'currency',
        weight: 0,
        stackable: true,
        maxStack: 999999,
        usable: false,
        tradeable: true
      },

      // Food & Drinks
      'bread': {
        name: 'Bread',
        description: 'Fresh baked bread',
        category: 'food',
        weight: 200,
        stackable: true,
        maxStack: 10,
        usable: true,
        consumable: true,
        effects: { hunger: 20 }
      },
      'water': {
        name: 'Water Bottle',
        description: 'Fresh drinking water',
        category: 'drink',
        weight: 500,
        stackable: true,
        maxStack: 10,
        usable: true,
        consumable: true,
        effects: { thirst: 30 }
      },
      'sandwich': {
        name: 'Sandwich',
        description: 'Ham and cheese sandwich',
        category: 'food',
        weight: 300,
        stackable: true,
        maxStack: 5,
        usable: true,
        consumable: true,
        effects: { hunger: 40 }
      },
      'cola': {
        name: 'Cola',
        description: 'Refreshing cola drink',
        category: 'drink',
        weight: 350,
        stackable: true,
        maxStack: 10,
        usable: true,
        consumable: true,
        effects: { thirst: 25, energy: 5 }
      },

      // Weapons
      'weapon_pistol': {
        name: 'Pistol',
        description: 'Standard handgun',
        category: 'weapon',
        weight: 1200,
        stackable: false,
        usable: true,
        tradeable: true
      },
      'weapon_assaultrifle': {
        name: 'Assault Rifle',
        description: 'Military grade rifle',
        category: 'weapon',
        weight: 3500,
        stackable: false,
        usable: true,
        tradeable: true
      },

      // Ammo
      'ammo_pistol': {
        name: 'Pistol Ammo',
        description: '9mm ammunition',
        category: 'ammo',
        weight: 5,
        stackable: true,
        maxStack: 500,
        usable: false,
        tradeable: true
      },
      'ammo_rifle': {
        name: 'Rifle Ammo',
        description: '5.56mm ammunition',
        category: 'ammo',
        weight: 10,
        stackable: true,
        maxStack: 500,
        usable: false,
        tradeable: true
      },

      // Medical
      'bandage': {
        name: 'Bandage',
        description: 'Stops bleeding',
        category: 'medical',
        weight: 50,
        stackable: true,
        maxStack: 20,
        usable: true,
        consumable: true,
        effects: { health: 10 }
      },
      'medkit': {
        name: 'Medical Kit',
        description: 'Full medical supplies',
        category: 'medical',
        weight: 500,
        stackable: true,
        maxStack: 5,
        usable: true,
        consumable: true,
        effects: { health: 50 }
      },

      // Tools
      'lockpick': {
        name: 'Lockpick',
        description: 'For picking locks',
        category: 'tool',
        weight: 50,
        stackable: true,
        maxStack: 10,
        usable: true,
        consumable: false,
        durability: 5
      },
      'drill': {
        name: 'Drill',
        description: 'Power drill',
        category: 'tool',
        weight: 2000,
        stackable: false,
        usable: true,
        durability: 20
      },
      'phone': {
        name: 'Mobile Phone',
        description: 'Smartphone',
        category: 'tool',
        weight: 200,
        stackable: false,
        usable: true,
        tradeable: true
      },
      'radio': {
        name: 'Radio',
        description: 'Two-way radio',
        category: 'tool',
        weight: 300,
        stackable: false,
        usable: true,
        tradeable: true
      },

      // Resources
      'wood': {
        name: 'Wood',
        description: 'Raw timber',
        category: 'resource',
        weight: 500,
        stackable: true,
        maxStack: 100,
        usable: false,
        tradeable: true
      },
      'stone': {
        name: 'Stone',
        description: 'Raw stone',
        category: 'resource',
        weight: 1000,
        stackable: true,
        maxStack: 100,
        usable: false,
        tradeable: true
      },
      'iron_ore': {
        name: 'Iron Ore',
        description: 'Unrefined iron',
        category: 'resource',
        weight: 800,
        stackable: true,
        maxStack: 100,
        usable: false,
        tradeable: true
      },
      'copper_ore': {
        name: 'Copper Ore',
        description: 'Unrefined copper',
        category: 'resource',
        weight: 700,
        stackable: true,
        maxStack: 100,
        usable: false,
        tradeable: true
      },

      // Crafted
      'iron_bar': {
        name: 'Iron Bar',
        description: 'Refined iron',
        category: 'crafted',
        weight: 500,
        stackable: true,
        maxStack: 50,
        usable: false,
        tradeable: true
      },
      'copper_bar': {
        name: 'Copper Bar',
        description: 'Refined copper',
        category: 'crafted',
        weight: 400,
        stackable: true,
        maxStack: 50,
        usable: false,
        tradeable: true
      },

      // Drugs (example)
      'weed': {
        name: 'Marijuana',
        description: 'Illegal substance',
        category: 'drug',
        weight: 100,
        stackable: true,
        maxStack: 50,
        usable: true,
        consumable: true,
        tradeable: true,
        illegal: true
      },

      // Keys
      'key_generic': {
        name: 'Key',
        description: 'Generic key',
        category: 'key',
        weight: 10,
        stackable: false,
        usable: true,
        tradeable: false
      },

      // Documents
      'id_card': {
        name: 'ID Card',
        description: 'Identification document',
        category: 'document',
        weight: 10,
        stackable: false,
        usable: true,
        tradeable: false,
        destroyable: false
      },
      'driver_license': {
        name: 'Driver License',
        description: 'Legal driving permit',
        category: 'document',
        weight: 10,
        stackable: false,
        usable: true,
        tradeable: false,
        destroyable: false
      },

      // Misc
      'backpack': {
        name: 'Backpack',
        description: 'Increases carrying capacity',
        category: 'misc',
        weight: 500,
        stackable: false,
        usable: true,
        tradeable: true,
        metadata: { extraSlots: 10 }
      }
    });
  }
}

// Export for both server and client
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ItemRegistry;
}
