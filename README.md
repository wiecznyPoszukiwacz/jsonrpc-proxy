# JSON-RPC Proxy 🔗

A TypeScript-based JSON-RPC proxy server implementation that provides a flexible and extensible platform for routing JSON-RPC requests.

## Features ✨

- **TypeScript Support**: Full TypeScript implementation with ES modules
- **Modular Transport Layer**: Extensible transport system (HTTP transport included)
- **JSON-RPC 2.0 Compliant**: Implements JSON-RPC 2.0 specification
- **Request Handling**: Flexible request handling and proxy capabilities
- **Testing**: Comprehensive test suite with Vitest
- **Development Tools**: ESLint, TypeScript compilation, and more

## Requirements 📋

- Node.js >= 18.0.0
- npm or yarn

## Installation 🚀

```bash
# Clone the repository
git clone <your-repo-url>
cd jsonrpc-proxy

# Install dependencies
npm install
```

## Usage 🔧

### Development

```bash
# Run in development mode
npm run dev

# Build the project
npm run build

# Start production server
npm start
```

### Testing

```bash
# Run tests
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Type check
npm run typecheck

# Clean build directory
npm run clean
```

## Configuration ⚙️

The server runs on port `22245` by default. You can modify the configuration in `src/main.mts`.

## Architecture 🏗️

### Core Components

- **ProxyServer**: Main server class that manages transports and handles requests
- **Transport**: Abstract transport layer for different communication protocols
- **HttpTransport**: HTTP implementation of the transport layer
- **RequestHandler**: Handles incoming JSON-RPC requests
- **JsonRpcClient**: Client implementation for outgoing requests

### Key Files

- `src/main.mts` - Application entry point
- `src/ProxyServer.mts` - Core proxy server implementation
- `src/types.mts` - TypeScript type definitions
- `src/Transport.mts` - Abstract transport interface
- `src/HttpTransport.mts` - HTTP transport implementation

## JSON-RPC Support 📡

This proxy supports JSON-RPC 2.0 specification including:

- Standard request/response format
- Error handling with proper error codes
- Batch requests support
- Notification handling

### Error Codes

- `-32700` Parse error
- `-32600` Invalid request
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error

## Development 💻

### Project Structure

```
src/
├── main.mts              # Entry point
├── types.mts             # Type definitions
├── ProxyServer.mts       # Core server
├── Transport.mts         # Transport interface
├── HttpTransport.mts     # HTTP transport
├── JsonRpcClient.mts     # JSON-RPC client
├── RequestHandler.mts    # Request handling
└── commonHandlers/       # Common request handlers
    └── ProxyHandler.mts
```

### Code Standards

- ES modules with `.mts` and `.mjs` extensions
- TypeScript with explicit type annotations
- English comments and variable names
- Access modifiers (public, protected, private)
- Comprehensive testing for new features

## Contributing 🤝

1. Follow the existing code style and conventions
2. Add tests for new functionality
3. Update version in `package.json` for significant changes
4. Maintain the changelog
5. Use NerdFonts icons where appropriate

## License 📄

MIT License - see LICENSE file for details

## Version 📦

Current version: 0.1.0

---

Built with ❤️ using TypeScript and Node.js