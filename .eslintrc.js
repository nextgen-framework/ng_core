module.exports = {
  env: {
    es2021: true,
    node: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  globals: {
    // FiveM globals
    GetResourcePath: 'readonly',
    GetCurrentResourceName: 'readonly',
    GetNumPlayerIndices: 'readonly',
    GetPlayerName: 'readonly',
    on: 'readonly',
    emit: 'readonly',
    onNet: 'readonly',
    emitNet: 'readonly',
    RegisterCommand: 'readonly',
    setImmediate: 'readonly',
    global: 'writable'
  },
  rules: {
    // Detect wrong framework methods
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="executeHook"]',
        message: '❌ this.framework.executeHook does not exist. Use: this.framework.runHook'
      },
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="triggerHook"]',
        message: '❌ this.framework.triggerHook does not exist. Use: this.framework.runHook'
      },
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="callHook"]',
        message: '❌ this.framework.callHook does not exist. Use: this.framework.runHook'
      },
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="emitHook"]',
        message: '❌ this.framework.emitHook does not exist. Use: this.framework.runHook'
      }
    ],
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off'
  },
  overrides: [
    {
      // Client-side specific rules
      files: ['**/client.js'],
      env: {
        browser: true,
        node: false
      },
      rules: {
        // Prevent require() in client code
        'no-restricted-globals': [
          'error',
          {
            name: 'require',
            message: '❌ require() is NOT available in FiveM client environment'
          }
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'CallExpression[callee.name="require"]',
            message: '❌ require() is NOT available in FiveM client environment. Use global exports instead.'
          }
        ]
      }
    },
    {
      // Server-side specific rules
      files: ['**/server.js'],
      env: {
        node: true
      }
    }
  ]
};
