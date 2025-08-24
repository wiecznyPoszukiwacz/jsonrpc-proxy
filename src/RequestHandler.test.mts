import { describe, it, expect } from 'vitest';
import { RequestHandler } from './RequestHandler.mjs';
import { JsonRpcRequest, JsonRpcResponse } from './types.mjs';

/**
 * Concrete implementation of RequestHandler for testing
 */
class TestRequestHandler extends RequestHandler {
	private readonly supportedMethods: Set<string>;

	public constructor(supportedMethods: string[] = []) {
		super();
		this.supportedMethods = new Set(supportedMethods);
	}

	/**
	 * Test implementation that checks if method is in supported methods
	 */
	public async canHandle(request: JsonRpcRequest): Promise<boolean> {
		return this.supportedMethods.has(request.method);
	}

	/**
	 * Test implementation that returns a simple success response
	 */
	public async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		return {
			jsonrpc: '2.0',
			id: request.id ?? null,
			result: { 
				method: request.method,
				handled: true,
				params: request.params
			}
		};
	}
}

describe('RequestHandler', () => {
	describe('abstract class implementation', () => {
		it('should allow concrete implementation', () => {
			const handler = new TestRequestHandler(['test.method']);
			expect(handler).toBeDefined();
			expect(handler).toBeInstanceOf(RequestHandler);
		});
	});

	describe('canHandle method', () => {
		it('should return true for supported methods', async () => {
			const handler = new TestRequestHandler(['test.method', 'another.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const result = await handler.canHandle(request);
			expect(result).toBe(true);
		});

		it('should return false for unsupported methods', async () => {
			const handler = new TestRequestHandler(['test.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'unknown.method',
				id: 1
			};

			const result = await handler.canHandle(request);
			expect(result).toBe(false);
		});

		it('should handle requests with no parameters', async () => {
			const handler = new TestRequestHandler(['simple.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'simple.method',
				id: 'test-id'
			};

			const canHandle = await handler.canHandle(request);
			expect(canHandle).toBe(true);
		});

		it('should handle requests with array parameters', async () => {
			const handler = new TestRequestHandler(['array.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'array.method',
				id: 1,
				params: [1, 2, 3, 'test']
			};

			const canHandle = await handler.canHandle(request);
			expect(canHandle).toBe(true);
		});

		it('should handle requests with object parameters', async () => {
			const handler = new TestRequestHandler(['object.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'object.method',
				id: 1,
				params: { name: 'test', value: 42, nested: { deep: true } }
			};

			const canHandle = await handler.canHandle(request);
			expect(canHandle).toBe(true);
		});

		it('should handle requests with null id', async () => {
			const handler = new TestRequestHandler(['null.id.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'null.id.method',
				id: null
			};

			const canHandle = await handler.canHandle(request);
			expect(canHandle).toBe(true);
		});

		it('should handle notification requests (no id)', async () => {
			const handler = new TestRequestHandler(['notification.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'notification.method'
			};

			const canHandle = await handler.canHandle(request);
			expect(canHandle).toBe(true);
		});
	});

	describe('handle method', () => {
		it('should process request and return response', async () => {
			const handler = new TestRequestHandler(['test.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 123,
				params: { input: 'test-data' }
			};

			const response = await handler.handle(request);
			
			expect(response).toEqual({
				jsonrpc: '2.0',
				id: 123,
				result: {
					method: 'test.method',
					handled: true,
					params: { input: 'test-data' }
				}
			});
		});

		it('should preserve request id in response', async () => {
			const handler = new TestRequestHandler(['id.test']);
			
			const testCases = [
				{ id: 1, type: 'number' },
				{ id: 'string-id', type: 'string' },
				{ id: null, type: 'null' }
			];

			for (const testCase of testCases) {
				const request: JsonRpcRequest = {
					jsonrpc: '2.0',
					method: 'id.test',
					id: testCase.id
				};

				const response = await handler.handle(request);
				expect(response.id).toBe(testCase.id);
			}
		});

		it('should handle requests with array parameters', async () => {
			const handler = new TestRequestHandler(['array.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'array.method',
				id: 1,
				params: ['arg1', 42, true, { nested: 'value' }]
			};

			const response = await handler.handle(request);
			
			expect(response.result).toEqual({
				method: 'array.method',
				handled: true,
				params: ['arg1', 42, true, { nested: 'value' }]
			});
		});

		it('should handle requests with object parameters', async () => {
			const handler = new TestRequestHandler(['object.method']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'object.method',
				id: 'obj-test',
				params: {
					name: 'test-object',
					values: [1, 2, 3],
					metadata: {
						type: 'test',
						version: '1.0'
					}
				}
			};

			const response = await handler.handle(request);
			
			expect((response.result as any)?.params).toEqual(request.params);
		});

		it('should handle requests without parameters', async () => {
			const handler = new TestRequestHandler(['no.params']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'no.params',
				id: 'no-params-test'
			};

			const response = await handler.handle(request);
			
			expect(response.result).toEqual({
				method: 'no.params',
				handled: true,
				params: undefined
			});
		});
	});

	describe('JSON-RPC 2.0 compliance', () => {
		it('should maintain JSON-RPC 2.0 protocol version', async () => {
			const handler = new TestRequestHandler(['version.test']);
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'version.test',
				id: 1
			};

			const response = await handler.handle(request);
			expect(response.jsonrpc).toBe('2.0');
		});

		it('should handle various id types correctly', async () => {
			const handler = new TestRequestHandler(['id.types']);
			
			const idTypes = [
				1,           // number
				'string',    // string  
				null,        // null
				0,           // zero
				'',          // empty string
			];

			for (const id of idTypes) {
				const request: JsonRpcRequest = {
					jsonrpc: '2.0',
					method: 'id.types',
					id: id
				};

				const response = await handler.handle(request);
				expect(response.id).toBe(id);
				expect(response.jsonrpc).toBe('2.0');
			}
		});
	});

	describe('error scenarios', () => {
		it('should be able to implement error handling in concrete classes', () => {
			class ErrorTestHandler extends RequestHandler {
				public async canHandle(request: JsonRpcRequest): Promise<boolean> {
					return request.method === 'error.test';
				}

				public async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
					if (request.method === 'error.test') {
						return {
							jsonrpc: '2.0',
							id: request.id ?? null,
							error: {
								code: -32000,
								message: 'Test error',
								data: { method: request.method }
							}
						};
					}

					return {
						jsonrpc: '2.0',
						id: request.id ?? null,
						result: null
					};
				}
			}

			const handler = new ErrorTestHandler();
			expect(handler).toBeDefined();
		});
	});

	describe('async behavior', () => {
		it('should handle async operations correctly', async () => {
			class AsyncTestHandler extends RequestHandler {
				public async canHandle(request: JsonRpcRequest): Promise<boolean> {
					// Simulate async operation
					await new Promise(resolve => setTimeout(resolve, 1));
					return request.method === 'async.test';
				}

				public async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
					// Simulate async processing
					await new Promise(resolve => setTimeout(resolve, 1));
					
					return {
						jsonrpc: '2.0',
						id: request.id ?? null,
						result: { 
							processed: true,
							timestamp: Date.now()
						}
					};
				}
			}

			const handler = new AsyncTestHandler();
			
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'async.test',
				id: 'async-1'
			};

			const canHandle = await handler.canHandle(request);
			expect(canHandle).toBe(true);

			const response = await handler.handle(request);
			expect((response.result as any)?.processed).toBe(true);
			expect(typeof (response.result as any)?.timestamp).toBe('number');
		});
	});
});