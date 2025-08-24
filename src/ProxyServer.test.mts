import { describe, it, expect, beforeEach } from 'vitest';
import { ProxyServer } from './ProxyServer.mjs';
import { RequestHandler } from './RequestHandler.mjs';
import { JsonRpcRequest, JsonRpcResponse, JsonRpcErrorCode } from './types.mjs';

// Mock handler for testing
class MockHandler extends RequestHandler {
	constructor(
		private methodToHandle: string,
		private responseResult: unknown = 'mock-result'
	) {
		super();
	}

	async canHandle(request: JsonRpcRequest): Promise<boolean> {
		return request.method === this.methodToHandle;
	}

	async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		return {
			jsonrpc: '2.0',
			id: request.id ?? null,
			result: this.responseResult
		};
	}
}

// Faulty handler for error testing
class FaultyHandler extends RequestHandler {
	async canHandle(_request: JsonRpcRequest): Promise<boolean> {
		throw new Error('Handler canHandle error');
	}

	async handle(_request: JsonRpcRequest): Promise<JsonRpcResponse> {
		throw new Error('Handler handle error');
	}
}

describe('ProxyServer', () => {
	let server: ProxyServer;

	beforeEach(() => {
		server = new ProxyServer();
	});

	describe('handler registration', () => {
		it('should register single handler', () => {
			const handler = new MockHandler('test.method');
			
			server.registerHandler(handler);
			
			expect(server['handlers']).toHaveLength(1);
			expect(server['handlers'][0]).toBe(handler);
		});

		it('should register multiple handlers', () => {
			const handlers = [
				new MockHandler('method1'),
				new MockHandler('method2'),
				new MockHandler('method3')
			];
			
			server.registerHandlers(handlers);
			
			expect(server['handlers']).toHaveLength(3);
			expect(server['handlers']).toEqual(handlers);
		});

		it('should register handlers in order', () => {
			const handler1 = new MockHandler('test1');
			const handler2 = new MockHandler('test2');
			
			server.registerHandler(handler1);
			server.registerHandler(handler2);
			
			expect(server['handlers'][0]).toBe(handler1);
			expect(server['handlers'][1]).toBe(handler2);
		});
	});

	describe('handleReceivedMessage', () => {
		it('should route request to correct handler', async () => {
			const handler1 = new MockHandler('method1', 'result1');
			const handler2 = new MockHandler('method2', 'result2');
			
			server.registerHandlers([handler1, handler2]);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'method2',
				id: 123
			};

			const response = await server.handleReceivedMessage(request);
			
			expect(response).toEqual({
				jsonrpc: '2.0',
				id: 123,
				result: 'result2'
			});
		});

		it('should use first matching handler', async () => {
			const handler1 = new MockHandler('same-method', 'first-result');
			const handler2 = new MockHandler('same-method', 'second-result');
			
			server.registerHandlers([handler1, handler2]);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'same-method',
				id: 456
			};

			const response = await server.handleReceivedMessage(request);
			
			expect(response).toEqual({
				jsonrpc: '2.0',
				id: 456,
				result: 'first-result'
			});
		});

		it('should return METHOD_NOT_FOUND when no handler matches', async () => {
			const handler = new MockHandler('different-method');
			server.registerHandler(handler);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'nonexistent-method',
				id: 789
			};

			const response = await server.handleReceivedMessage(request);
			
			expect(response).toEqual({
				jsonrpc: '2.0',
				id: 789,
				error: {
					code: JsonRpcErrorCode.METHOD_NOT_FOUND,
					message: "Method 'nonexistent-method' not found"
				}
			});
		});

		it('should continue to next handler when current handler fails', async () => {
			const faultyHandler = new FaultyHandler();
			const workingHandler = new MockHandler('test-method', 'success');
			
			server.registerHandlers([faultyHandler, workingHandler]);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test-method',
				id: 101
			};

			const response = await server.handleReceivedMessage(request);
			
			expect(response).toEqual({
				jsonrpc: '2.0',
				id: 101,
				result: 'success'
			});
		});

		it('should handle request with null id', async () => {
			const handler = new MockHandler('test');
			server.registerHandler(handler);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test',
				id: null
			};

			const response = await server.handleReceivedMessage(request);
			
			expect(response.id).toBe(null);
		});

		it('should handle request without id', async () => {
			const handler = new MockHandler('test');
			server.registerHandler(handler);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test'
			};

			const response = await server.handleReceivedMessage(request);
			
			expect(response.id).toBe(null);
		});
	});
});