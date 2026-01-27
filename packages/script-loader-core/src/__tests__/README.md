# Script Loader Core Tests

This directory contains behavior-driven tests for the script-loader-core package.

## Test Philosophy

These tests define the **DESIRED behavior** of the system, not just what the current implementation does. Each test represents a **contract** that the component must fulfill.

### Benefits of This Approach

1. **Contract-Driven**: Tests focus on what the component _should_ do, not how it does it
2. **Refactoring-Resistant**: Implementation changes don't break tests as long as behavior is preserved
3. **Documentation**: Tests serve as executable specifications
4. **Quality Gates**: Tests catch regressions and ensure desired properties hold

## Test Structure

### ScriptRegistry Tests (17 tests)
Tests the central registry for loaded scripts:
- **Registration Contract**: Store and retrieve script metadata
- **Unregistration Contract**: Clean removal of scripts
- **Query Operations Contract**: Search and list functionality
- **Clear Operation Contract**: Reset to empty state
- **Edge Cases**: Handle empty state, special characters, etc.

### ScriptCompiler Tests (22 tests)
Tests TypeScript/JavaScript compilation with caching:
- **TypeScript Compilation**: TS → executable JS transformation
- **JavaScript Pass-through**: Modern JS handling
- **Caching**: mtime-based compilation cache
- **Cache Management**: Invalidation and clearing
- **Error Handling**: Syntax errors and failure recovery
- **Output Characteristics**: Valid executable code
- **Type System Handling**: Type erasure and generics

### ScriptExecutor Tests (24 tests)
Tests script execution with context injection:
- **Module Execution**: CJS/ESM export handling
- **Context Injection**: Provide runtime context to scripts
- **Node.js Variables**: `__filename`, `__dirname`, `require`
- **Script Isolation**: Independent execution scopes
- **Error Handling**: Runtime errors and exceptions
- **Advanced Features**: Async, classes, closures
- **Function Execution**: Arbitrary function execution
- **Path Handling**: Absolute and relative paths

### ScriptLoaderCore Tests (25 tests)
Integration tests for the complete system:
- **Initial Load**: Startup script discovery
- **Hot Reload**: File watching and automatic reload
- **Error Handling**: Compilation and runtime errors
- **Lifecycle Management**: Start/stop/restart
- **Path Configuration**: Configurable scripts directory
- **Manual Reload**: User-triggered reload
- **Integration Scenarios**: End-to-end workflows

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test -- --coverage
```

## Test Helpers

The `test-helpers.ts` file provides mock implementations:

- **MockScriptHost**: In-memory file system for testing
- **MockPathUtils**: Path operations for testing
- **MockLogger**: Captures log messages for assertions
- **Utility Functions**: `delay`, `waitFor` for async testing

## Adding New Tests

When adding tests, follow these guidelines:

1. **Name tests by behavior**: "should [expected behavior]"
2. **Use comments to explain intent**: Add `// DESIRED:` comments
3. **Focus on contracts**: Test what, not how
4. **Keep tests independent**: Each test should work in isolation
5. **Use descriptive assertions**: Make failures easy to understand

Example:
```typescript
it("should reload script when file is modified", async () => {
  // DESIRED: File changes trigger automatic reload
  scriptHost.setFile("tool.ts", "v1");
  await loader.start();

  scriptHost.updateFile("tool.ts", "v2");
  scriptHost.triggerModify("tool.ts");

  await delay(100);
  expect(callbacks.onScriptLoaded).toHaveBeenCalledTimes(2);
});
```

## Current Test Coverage

- **Total Tests**: 88
- **Test Files**: 4
- **Components Covered**: 4 (Registry, Compiler, Executor, Core)
- **Status**: ✅ All passing

## Test Failures

If tests fail:

1. **Read the failure message**: It explains what behavior is missing
2. **Check if implementation changed**: Behavior changes may be intentional
3. **Update tests if needed**: If new behavior is correct, update test expectations
4. **Never weaken tests**: Don't remove assertions to make tests pass

Remember: **Test failures are opportunities to understand the system better.**
