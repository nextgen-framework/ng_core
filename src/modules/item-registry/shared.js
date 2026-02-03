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
    this.framework.utils.Log(`[Item Registry] Initialized (${this.items.size} items)`, 'info');
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
   * Unregister an item
   * @param {string} itemId - Item ID to remove
   * @returns {boolean} True if item was removed
   */
  unregisterItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return false;

    // Remove from category
    const categorySet = this.categories.get(item.category);
    if (categorySet) {
      categorySet.delete(itemId);
      if (categorySet.size === 0) {
        this.categories.delete(item.category);
      }
    }

    this.items.delete(itemId);
    return true;
  }
}

// Export for both server and client
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ItemRegistry;
}
