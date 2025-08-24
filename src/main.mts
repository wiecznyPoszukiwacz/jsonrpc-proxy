#!/usr/bin/env node

import { ProxyServer } from "./ProxyServer.mjs";
import { HttpTransport } from './HttpTransport.mjs'

/**
 * Main entry point for the JSON-RPC proxy server
 * Initializes and starts the proxy server with configuration
 */
async function main(): Promise<void> {
	console.log('🚀 Starting JSON-RPC Proxy Server...');

	const version: string = '0.1.0';
	console.log(`📦 Version: ${version}`);

	const server = new ProxyServer();
	const httpTransport = new HttpTransport({
		port: 22245
	})
	server.registerTransport(httpTransport)

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
