## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

<!-- Mark the relevant option with an "x" -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (new module or functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Database migration

## Changes Made

<!-- List the specific changes made in this PR -->

### Modules Added/Modified

-
-

### Files Changed

-
-

## Testing

<!-- Describe the tests you ran to verify your changes -->

### Test Environment

- FiveM Server Version:
- ng_core Version:
- Node.js Version:

### Manual Testing Steps

1.
2.
3.

### Automated Tests

- [ ] All existing tests pass
- [ ] New tests added (if applicable)
- [ ] ng_test passes without errors

### Test Results

```
# Paste test results here
```

## Performance Impact

<!-- Describe any performance implications -->

- [ ] No performance impact
- [ ] Improves performance (describe below)
- [ ] May impact performance (describe below)

<!-- Provide /perf stats if performance-related -->

## Breaking Changes

<!-- List any breaking changes and migration steps -->

- [ ] No breaking changes
- [ ] Breaking changes (describe below):

<!--
If breaking changes:
1. What changed?
2. Why was it necessary?
3. How to migrate existing code?
-->

## Database Changes

<!-- If this PR includes database migrations -->

- [ ] No database changes
- [ ] New migration added (describe below)

<!--
If migration added:
- Migration number:
- Tables affected:
- Migration is idempotent: [ ] Yes [ ] No
-->

## Module Checklist

<!-- If adding/modifying a module -->

- [ ] Module follows naming conventions
- [ ] Priority is appropriate for module type
- [ ] Module has init() method
- [ ] Module has destroy() method
- [ ] Module is added to config.js
- [ ] Module is added to fxmanifest.lua
- [ ] Module documentation added (README.md)

## Code Quality

<!-- Code quality checks -->

- [ ] ESLint passes (`yarn lint`)
- [ ] Code is properly formatted
- [ ] Code follows style guide
- [ ] Complex logic has comments
- [ ] Public methods have JSDoc comments
- [ ] No unused variables or dead code
- [ ] No console.log (use logger module)

## Security

<!-- Security considerations -->

- [ ] Input validation implemented
- [ ] SQL queries use parameters (no concatenation)
- [ ] Permissions checked for sensitive operations
- [ ] No sensitive data in logs
- [ ] No hardcoded credentials
- [ ] RPC handlers validate input
- [ ] Client events are not trusted for critical operations

## Documentation

<!-- Documentation updates -->

- [ ] README.md updated
- [ ] API documentation updated
- [ ] CHANGELOG updated (if exists)
- [ ] Module README added (if new module)
- [ ] Code comments added for complex logic
- [ ] Migration guide provided (if breaking changes)

## Screenshots/Demos (if applicable)

<!-- Add screenshots or video demos to help explain your changes -->

## Checklist

- [ ] My code follows the code style of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have tested my changes in a live FiveM server
- [ ] Any dependent changes have been merged and published

## Additional Context

<!-- Add any additional context or notes for reviewers -->

## Related Issues

<!-- Link any related issues here -->

Fixes #
Closes #
Relates to #

## Reviewers

<!-- Tag specific reviewers if needed -->

@username
