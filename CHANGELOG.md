# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2024-08-24

### Added
- ✨ **Rule-level request and response transformations** in ProxyHandlerRule
  - Per-method transformation functions for granular control
  - Support for both `requestTransform` and `responseTransform` in individual rules
  - Original request context available in response transformations
- 🔧 **Advanced transformation options** with `TransformOptions`:
  - `priority`: Control execution order ('before' or 'after' global transformations)
  - `includeOriginalRequest`: Pass original request to response transformation
  - `onTransformError`: Configurable error handling ('throw', 'skip', 'log-and-skip')
- 📝 **New transformation types** in types.mts:
  - `RequestTransformFunction` type for type-safe request transformations
  - `ResponseTransformFunction` type with optional original request parameter
  - `TransformOptions` interface for fine-grained control
- ✅ **Enhanced validation** for transformation properties in ProxyHandlerRule
- 🧪 **Comprehensive tests** for all transformation scenarios and error handling
- 📚 **Example transformation handler** in customRules/03-transformation-examples.mjs

### Enhanced
- 🔄 **Transformation pipeline** now supports layered transformations with priority system
- 🛡️ **Error handling** with configurable strategies for transformation failures
- 🔍 **Better error messages** with specific transformation failure details
- 📖 **Improved JSDoc documentation** for all transformation-related methods

### Technical Details
- Rule transformations can execute before or after global transformations
- Response transformations receive original request context when enabled
- Robust error handling prevents cascade failures from transformation errors
- Backward compatible with existing global transformation functions
- Type-safe implementation with comprehensive TypeScript support

## [0.2.0] - 2025-08-24

### Added
- ✨ **Custom Handler Loading System** - Load custom request handlers from `customRules/` directory
- 📂 **Automatic Directory Scanning** - Loads handlers from `.mjs` files in alphabetical order
- 🔧 **Handler Registration** - Enhanced ProxyServer with handler registration and routing system
- 📝 **Multiple Export Formats** - Support for both single handler export (`export default`) and multiple handlers export (`export const handlers = []`)
- 🔍 **Error Handling** - Graceful handling of malformed handler files without stopping server startup
- 📋 **Comprehensive Logging** - Verbose logging for handler loading and execution process
- 🧪 **Test Suite** - Added comprehensive tests for ProxyServer and CustomHandlerLoader functionality

### Enhanced
- 🚀 **ProxyServer** - Added handler chain execution with proper error handling
- 🌐 **HttpTransport** - Fixed request forwarding to properly route through registered handlers
- 📋 **Request Processing** - Implemented proper handler priority and fallback mechanisms

### Examples
- 🏓 **Ping Handler** - Example single handler responding to 'ping' method calls
- 🔧 **System Handlers** - Example multiple handlers for system status and version requests

### Technical Details
- Handler files are loaded alphabetically by filename (e.g., `01-auth.mjs`, `02-logging.mjs`)
- Supports ES modules with `.mjs` extension for production compatibility
- Failed handler loading continues with other files instead of stopping
- First matching handler in the chain processes the request
- Unhandled methods return proper JSON-RPC METHOD_NOT_FOUND errors

## [0.1.0] - 2025-08-24

### Added
- 🚀 Initial JSON-RPC proxy server implementation
- 🌐 HTTP transport layer for JSON-RPC communication
- 🔧 Basic ProxyHandler for forwarding requests to upstream servers
- 📝 TypeScript definitions for JSON-RPC protocol
- 🧪 Test framework setup with Vitest
- 📦 Build and development scripts