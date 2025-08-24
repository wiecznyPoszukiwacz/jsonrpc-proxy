import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyHandler, type ProxyHandlerRule, type ProxyHandlerOptions } from './ProxyHandler.mjs';
import { JsonRpcRequest, JsonRpcErrorCode } from '../types.mjs';

// Mock HttpClient
vi.mock('../HttpClient.mjs', () => ({
	JsonRpcHttpClient: vi.fn()
}));

import { JsonRpcHttpClient } from '../HttpClient.mjs';
const mockJsonRpcHttpClient = vi.mocked(JsonRpcHttpClient);
const mockMakeRequest = vi.fn();

describe('ProxyHandler', () => {
	let proxyHandler: ProxyHandler;
	let mockRule: ProxyHandlerRule;
	let mockOptions: ProxyHandlerOptions;

	beforeEach(() => {
		vi.clearAllMocks();
		
		mockMakeRequest.mockResolvedValue({
			jsonrpc: '2.0',
			id: 1,
			result: { success: true, url: 'http://localhost:3000/jsonrpc' }
		});

		mockJsonRpcHttpClient.mockImplementation(() => ({
			makeRequest: mockMakeRequest
		}) as any);

		mockRule = {
			method: 'test.method',
			upstreamUrl: 'http://localhost:3000/jsonrpc'
		};

		mockOptions = {
			enableLogging: false
		};

		proxyHandler = new ProxyHandler(mockOptions);
	});

	describe('constructor', () => {
		it('should create ProxyHandler with valid options', () => {
			expect(proxyHandler).toBeDefined();
		});

		it('should throw error for invalid defaultUrl', () => {
			expect(() => {
				new ProxyHandler({ defaultUrl: 'invalid-url' });
			}).toThrow('Invalid defaultUrl');
		});
	});

	describe('addHandlerRule', () => {
		it('should add valid handler rule', () => {
			expect(() => {
				proxyHandler.addHandlerRule(mockRule);
			}).not.toThrow();
		});

		it('should throw error for empty method', () => {
			expect(() => {
				proxyHandler.addHandlerRule({ ...mockRule, method: '' });
			}).toThrow('ProxyHandlerRule.method must be a non-empty string');
		});

		it('should throw error for invalid upstream URL', () => {
			expect(() => {
				proxyHandler.addHandlerRule({ ...mockRule, upstreamUrl: 'invalid-url' });
			}).toThrow('Invalid upstreamUrl');
		});
	});

	describe('canHandle', () => {
		beforeEach(() => {
			proxyHandler.addHandlerRule(mockRule);
		});

		it('should return true for registered method', async () => {
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const result = await proxyHandler.canHandle(request);
			expect(result).toBe(true);
		});

		it('should return false for unregistered method', async () => {
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'unknown.method',
				id: 1
			};

			const result = await proxyHandler.canHandle(request);
			expect(result).toBe(false);
		});

		it('should return false for invalid request format', async () => {
			const invalidRequest = {
				method: 'test.method',
				id: 1
				// Missing jsonrpc field
			} as any;

			const result = await proxyHandler.canHandle(invalidRequest);
			expect(result).toBe(false);
		});
	});

	describe('handle', () => {
		beforeEach(() => {
			proxyHandler.addHandlerRule(mockRule);
		});

		it('should successfully proxy valid request', async () => {
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const response = await proxyHandler.handle(request);
			
			expect(response).toEqual({
				jsonrpc: '2.0',
				id: 1,
				result: { success: true, url: 'http://localhost:3000/jsonrpc' }
			});
		});

		it('should return error for invalid request format', async () => {
			const invalidRequest = {
				method: 'test.method',
				id: 1
			} as any;

			const response = await proxyHandler.handle(invalidRequest);
			
			expect(response.error).toBeDefined();
			expect(response.error?.code).toBe(JsonRpcErrorCode.INVALID_REQUEST);
		});

		it('should return METHOD_NOT_FOUND for unregistered method', async () => {
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'unknown.method',
				id: 1
			};

			const response = await proxyHandler.handle(request);
			
			expect(response.error).toBeDefined();
			expect(response.error?.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND);
			expect(response.error?.message).toContain('unknown.method');
		});
	});

	describe('request validation', () => {
		it('should validate JSON-RPC 2.0 format', async () => {
			proxyHandler.addHandlerRule(mockRule);
			
			const invalidRequests = [
				{ jsonrpc: '1.0', method: 'test.method', id: 1 }, // Wrong version
				{ jsonrpc: '2.0', id: 1 }, // Missing method
				{ jsonrpc: '2.0', method: '', id: 1 }, // Empty method
				{ jsonrpc: '2.0', method: 123, id: 1 }, // Invalid method type
			];

			for (const request of invalidRequests) {
				const canHandle = await proxyHandler.canHandle(request as any);
				expect(canHandle).toBe(false);
			}
		});
	});

	describe('retry logic', () => {
		it('should retry failed requests when retry configured', async () => {
			const retryRule: ProxyHandlerRule = {
				...mockRule,
				retry: {
					maxAttempts: 3,
					delayMs: 10
				}
			};
			
			proxyHandler.addHandlerRule(retryRule);

			// Mock client to fail twice then succeed
			mockMakeRequest
				.mockRejectedValueOnce(new Error('Network error'))
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValueOnce({
					jsonrpc: '2.0',
					id: 1,
					result: { success: true }
				});

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const response = await proxyHandler.handle(request);
			
			expect(mockMakeRequest).toHaveBeenCalledTimes(3);
			expect(response.result).toEqual({ success: true });
		});
	});

	describe('request/response transformation', () => {
		it('should apply request transformation', async () => {
			const transformOptions: ProxyHandlerOptions = {
				requestTransform: (req) => ({
					...req,
					params: { ...req.params as any, transformed: true }
				})
			};

			const handler = new ProxyHandler(transformOptions);
			handler.addHandlerRule(mockRule);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1,
				params: { original: true }
			};

			await handler.handle(request);

			// Verify the transformed request was passed to the client
			const makeRequestCall = mockMakeRequest.mock.calls[0];
			
			expect(makeRequestCall[0].params).toEqual({
				original: true,
				transformed: true
			});
		});

		it('should apply response transformation', async () => {
			const transformOptions: ProxyHandlerOptions = {
				responseTransform: (res) => ({
					...res,
					result: { ...res.result as any, transformed: true }
				})
			};

			const handler = new ProxyHandler(transformOptions);
			handler.addHandlerRule(mockRule);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const response = await handler.handle(request);
			
			expect(response.result).toEqual({
				success: true,
				url: 'http://localhost:3000/jsonrpc',
				transformed: true
			});
		});
	});

	describe('error handling', () => {
		it('should handle upstream HTTP errors', async () => {
			proxyHandler.addHandlerRule(mockRule);

			// Mock client to return HTTP error
			mockMakeRequest.mockRejectedValue(new Error('HTTP_ERROR: Server returned status 500'));

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const response = await proxyHandler.handle(request);
			
			expect(response.error).toBeDefined();
			expect(response.error?.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
			expect(response.error?.message).toBe('Upstream server error');
			expect((response.error?.data as any)?.type).toBe('HTTP_ERROR');
		});

		it('should handle timeout errors', async () => {
			proxyHandler.addHandlerRule(mockRule);

			mockMakeRequest.mockRejectedValue(new Error('TIMEOUT_ERROR: Request timeout after 5000ms'));

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const response = await proxyHandler.handle(request);
			
			expect(response.error?.message).toBe('Upstream server timeout');
			expect((response.error?.data as any)?.type).toBe('TIMEOUT_ERROR');
		});
	});

	describe('logging', () => {
		it('should log successful requests when enabled', async () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			
			const loggingHandler = new ProxyHandler({ enableLogging: true });
			loggingHandler.addHandlerRule(mockRule);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			await loggingHandler.handle(request);
			
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('✅ test.method [1] → http://localhost:3000/jsonrpc (SUCCESS)')
			);

			consoleSpy.mockRestore();
		});
	});
});