import { RequestHandler } from '../dist/RequestHandler.mjs';

/**
 * Example handler for system status requests
 */
class SystemStatusHandler extends RequestHandler {

	async canHandle(request) {
		return request.method === 'system.status';
	}

	async handle(request) {
		console.log(`🔧 System status handler processing request: ${request.id}`);
		
		return {
			jsonrpc: '2.0',
			id: request.id ?? null,
			result: {
				status: 'operational',
				uptime: process.uptime(),
				memory: process.memoryUsage(),
				version: '0.2.0'
			}
		};
	}
}

/**
 * Example handler for version requests
 */
class VersionHandler extends RequestHandler {

	async canHandle(request) {
		return request.method === 'system.version';
	}

	async handle(request) {
		console.log(`📦 Version handler processing request: ${request.id}`);
		
		return {
			jsonrpc: '2.0',
			id: request.id ?? null,
			result: {
				name: 'jsonrpc-proxy',
				version: '0.2.0',
				nodeVersion: process.version
			}
		};
	}
}

// Export multiple handlers as array
export const handlers = [
	new SystemStatusHandler(),
	new VersionHandler()
];