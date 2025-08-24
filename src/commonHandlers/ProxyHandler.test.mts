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

		it('should throw error for invalid requestTransform type', () => {
			expect(() => {
				proxyHandler.addHandlerRule({ 
					...mockRule, 
					requestTransform: 'not a function' as any 
				});
			}).toThrow('ProxyHandlerRule.requestTransform must be a function');
		});

		it('should throw error for invalid responseTransform type', () => {
			expect(() => {
				proxyHandler.addHandlerRule({ 
					...mockRule, 
					responseTransform: 'not a function' as any 
				});
			}).toThrow('ProxyHandlerRule.responseTransform must be a function');
		});

		it('should throw error for invalid transformOptions.priority', () => {
			expect(() => {
				proxyHandler.addHandlerRule({ 
					...mockRule, 
					transformOptions: { priority: 'invalid' as any }
				});
			}).toThrow('ProxyHandlerRule.transformOptions.priority must be "before" or "after"');
		});

		it('should throw error for invalid transformOptions.onTransformError', () => {
			expect(() => {
				proxyHandler.addHandlerRule({ 
					...mockRule, 
					transformOptions: { onTransformError: 'invalid' as any }
				});
			}).toThrow('ProxyHandlerRule.transformOptions.onTransformError must be "throw", "skip", or "log-and-skip"');
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
		it('should apply global request transformation', async () => {
			const transformOptions: ProxyHandlerOptions = {
				requestTransform: (req) => ({
					...req,
					params: { ...req.params as any, globalTransformed: true }
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
				globalTransformed: true
			});
		});

		it('should apply global response transformation', async () => {
			const transformOptions: ProxyHandlerOptions = {
				responseTransform: (res) => ({
					...res,
					result: { ...res.result as any, globalTransformed: true }
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
				globalTransformed: true
			});
		});

		it('should apply rule-specific request transformation with default priority (after global)', async () => {
			const handler = new ProxyHandler({
				requestTransform: (req) => ({
					...req,
					params: { ...req.params as any, globalTransformed: true }
				})
			});

			const ruleWithTransform: ProxyHandlerRule = {
				...mockRule,
				requestTransform: (req) => ({
					...req,
					params: { ...req.params as any, ruleTransformed: true }
				})
			};

			handler.addHandlerRule(ruleWithTransform);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1,
				params: { original: true }
			};

			await handler.handle(request);

			const makeRequestCall = mockMakeRequest.mock.calls[0];
			expect(makeRequestCall[0].params).toEqual({
				original: true,
				globalTransformed: true,
				ruleTransformed: true
			});
		});

		it('should apply rule-specific response transformation with original request context', async () => {
			const handler = new ProxyHandler({});

			const ruleWithTransform: ProxyHandlerRule = {
				...mockRule,
				responseTransform: (res, originalReq) => ({
					...res,
					result: { 
						...res.result as any, 
						ruleTransformed: true,
						originalMethod: originalReq?.method
					}
				}),
				transformOptions: {
					includeOriginalRequest: true
				}
			};

			handler.addHandlerRule(ruleWithTransform);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const response = await handler.handle(request);
			
			expect(response.result).toEqual({
				success: true,
				url: 'http://localhost:3000/jsonrpc',
				ruleTransformed: true,
				originalMethod: 'test.method'
			});
		});

		it('should apply transformations with before priority (rule before global)', async () => {
			const handler = new ProxyHandler({
				requestTransform: (req) => ({
					...req,
					params: { ...req.params as any, global: 'second' }
				})
			});

			const ruleWithTransform: ProxyHandlerRule = {
				...mockRule,
				requestTransform: (req) => ({
					...req,
					params: { ...req.params as any, rule: 'first' }
				}),
				transformOptions: {
					priority: 'before'
				}
			};

			handler.addHandlerRule(ruleWithTransform);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1,
				params: { original: true }
			};

			await handler.handle(request);

			const makeRequestCall = mockMakeRequest.mock.calls[0];
			expect(makeRequestCall[0].params).toEqual({
				original: true,
				rule: 'first',
				global: 'second'
			});
		});

		it('should handle transformation errors with skip strategy', async () => {
			const handler = new ProxyHandler({});

			const ruleWithFailingTransform: ProxyHandlerRule = {
				...mockRule,
				requestTransform: () => {
					throw new Error('Transformation failed');
				},
				transformOptions: {
					onTransformError: 'skip'
				}
			};

			handler.addHandlerRule(ruleWithFailingTransform);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1,
				params: { original: true }
			};

			await handler.handle(request);

			// Original request should be used since transformation was skipped
			const makeRequestCall = mockMakeRequest.mock.calls[0];
			expect(makeRequestCall[0].params).toEqual({ original: true });
		});

		it('should handle transformation errors with log-and-skip strategy', async () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			
			const handler = new ProxyHandler({ enableLogging: true });

			const ruleWithFailingTransform: ProxyHandlerRule = {
				...mockRule,
				requestTransform: () => {
					throw new Error('Transformation failed');
				},
				transformOptions: {
					onTransformError: 'log-and-skip'
				}
			};

			handler.addHandlerRule(ruleWithFailingTransform);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1,
				params: { original: true }
			};

			await handler.handle(request);

			// Should log the error
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('⚠️ rule request transform failed: Transformation failed - skipping transformation')
			);

			// Original request should be used
			const makeRequestCall = mockMakeRequest.mock.calls[0];
			expect(makeRequestCall[0].params).toEqual({ original: true });

			consoleSpy.mockRestore();
		});

		it('should throw transformation errors with throw strategy (default)', async () => {
			const handler = new ProxyHandler({});

			const ruleWithFailingTransform: ProxyHandlerRule = {
				...mockRule,
				requestTransform: () => {
					throw new Error('Transformation failed');
				}
				// onTransformError defaults to 'throw'
			};

			handler.addHandlerRule(ruleWithFailingTransform);

			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'test.method',
				id: 1
			};

			const response = await handler.handle(request);

			// Should return error response
			expect(response.error).toBeDefined();
			expect(response.error?.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
			expect(response.error?.message).toContain('Request transformation failed');
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