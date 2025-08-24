import { RequestHandler } from '../dist/RequestHandler.mjs';

/**
 * Example custom handler that responds to 'ping' method calls
 * This demonstrates how to create a simple custom handler
 */
export default class ExamplePingHandler extends RequestHandler {

	/**
	 * Determines if this handler can process the given request
	 * @param request - JSON-RPC request to evaluate
	 * @returns Promise resolving to true if handler can process request
	 */
	async canHandle(request) {
		return request.method === 'ping';
	}

	/**
	 * Processes the JSON-RPC request and returns response
	 * @param request - JSON-RPC request to handle
	 * @returns Promise resolving to JSON-RPC response
	 */
	async handle(request) {
		console.log(`🏓 Ping handler processing request: ${request.id}`);
		
		return {
			jsonrpc: '2.0',
			id: request.id ?? null,
			result: {
				message: 'pong',
				timestamp: new Date().toISOString(),
				requestId: request.id
			}
		};
	}
}