#!/usr/bin/env node

import { ProxyServer } from "./ProxyServer.mjs";
import { HttpTransport } from './HttpTransport.mjs'
import { ProxyHandler } from "./commonHandlers/ProxyHandler.mjs";
import { CustomHandlerLoader } from "./CustomHandlerLoader.mjs";

/**
 * Main entry point for the JSON-RPC proxy server
 * Initializes and starts the proxy server with configuration
 */
async function main(): Promise<void> {
	console.log('🚀 Starting JSON-RPC Proxy Server...');

	const version: string = '0.2.0';
	console.log(`📦 Version: ${version}`);

	// Initialize server
	const server = new ProxyServer();
	
	// Configure HTTP transport
	const httpTransport = new HttpTransport({
		port: 22246
	})
	server.registerTransport(httpTransport)

	// Load custom handlers from customRules/ directory
	console.log('🔍 Loading custom handlers...');
	const customLoader = new CustomHandlerLoader({
		customRulesDirectory: 'customRules',
		enableLogging: true
	});
	
	const customHandlers = await customLoader.loadHandlers();
	server.registerHandlers(customHandlers);

	// Register default proxy handler (fallback)
	const proxyHandler = new ProxyHandler({
		enableLogging: true
	});
	
	// Example proxy rule - you can configure these as needed
	// proxyHandler.addHandlerRule({
	// 	method: 'example.method',
	// 	upstreamUrl: 'http://localhost:3001'
	// });
	
	server.registerHandler(proxyHandler);

	await server.start()
}

/**
 * Handle process termination gracefully
 */
function setupGracefulShutdown(): void {
	process.on('SIGINT', () => {
		console.log('\n🛑 Received SIGINT, shutting down gracefully...');
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
		process.exit(0);
	});
}

// Initialize graceful shutdown handling
setupGracefulShutdown();

// Start the application
main().catch((error: unknown) => {
	console.error('❌ Failed to start server:', error);
	process.exit(1);
});
