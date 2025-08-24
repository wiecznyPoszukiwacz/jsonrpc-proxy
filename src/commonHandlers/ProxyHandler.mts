import { JsonRpcHttpClient } from "../HttpClient.mjs";
import { RequestHandler } from "../RequestHandler.mjs";
import { 
	JsonRpcRequest, 
	JsonRpcResponse, 
	JsonRpcErrorCode,
	RequestTransformFunction,
	ResponseTransformFunction,
	TransformOptions
} from "../types.mjs";

export type ProxyHandlerRule = {
	/** JSON-RPC method name to match */
	method: string;
	/** Upstream server URL for this method */
	upstreamUrl: string;
	/** Override timeout for this specific method */
	timeout?: number;
	/** Override HTTP headers for this specific method */
	headers?: Record<string, string>;
	/** Override retry configuration for this specific method */
	retry?: {
		maxAttempts: number;
		delayMs: number;
		exponentialBackoff?: boolean;
	};
	/** Request body transformation function for this specific method */
	requestTransform?: RequestTransformFunction;
	/** Response body transformation function for this specific method */
	responseTransform?: ResponseTransformFunction;
	/** Advanced transformation options */
	transformOptions?: TransformOptions;
}

export type ProxyHandlerOptions = {
	/** Default upstream URL when no specific rule matches */
	defaultUrl?: string;
	
	/** Default timeout for upstream requests in milliseconds */
	timeout?: number;
	
	/** Default HTTP headers to send to upstream servers */
	headers?: Record<string, string>;
	
	/** Retry configuration for failed requests */
	retry?: {
		/** Maximum number of retry attempts */
		maxAttempts: number;
		/** Delay between retries in milliseconds */
		delayMs: number;
		/** Whether to use exponential backoff */
		exponentialBackoff?: boolean;
	};
	
	/** Enable request/response logging */
	enableLogging?: boolean;
	
	/** Global request transformation function */
	requestTransform?: RequestTransformFunction;
	/** Global response transformation function */
	responseTransform?: ResponseTransformFunction;
}

export class ProxyHandler extends RequestHandler {


	protected handlerRules: Map<string, ProxyHandlerRule> = new Map()

	/**
	 * Adds a proxy rule for routing method calls to upstream servers
	 * @param rule - Proxy handler rule to add
	 * @throws Error if rule validation fails
	 */
	public addHandlerRule(rule: ProxyHandlerRule): void {
		this.validateProxyRule(rule);
		this.handlerRules.set(rule.method, rule);
	}

	/**
	 * Creates new ProxyHandler instance
	 * @param options - Configuration options for the proxy handler
	 * @throws Error if options validation fails
	 */
	public constructor(protected options: ProxyHandlerOptions) {
		super();
		this.validateOptions(options);
	}


	/**
	 * Checks if this handler can process the given request
	 * @param request - JSON-RPC request to evaluate
	 * @returns Promise resolving to true if handler can process request
	 */
	public override async canHandle(request: JsonRpcRequest): Promise<boolean> {
		if (!this.validateJsonRpcRequest(request)) {
			return false;
		}
		return this.handlerRules.has(request.method);
	}
	/**
	 * Processes JSON-RPC request by forwarding to appropriate upstream server
	 * @param request - JSON-RPC request to handle
	 * @returns Promise resolving to JSON-RPC response
	 */
	public override async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		// Validate request format
		if (!this.validateJsonRpcRequest(request)) {
			return this.createErrorResponse((request as any)?.id, JsonRpcErrorCode.INVALID_REQUEST, 'Invalid JSON-RPC request format');
		}

		const rule = this.handlerRules.get(request.method);

		if (!rule) {
			return this.createErrorResponse(request.id, JsonRpcErrorCode.METHOD_NOT_FOUND, `Method '${request.method}' not found`);
		}

		try {
			// Apply request transformations (rule-specific then global)
			const transformedRequest = await this.applyRequestTransformations(request, rule);
			
			// Create HTTP client with rule-specific or default configuration
			const clientOptions = this.getClientOptions(rule);
			const client = new JsonRpcHttpClient(rule.upstreamUrl, clientOptions);
			
			// Execute request with retry logic
			const response = await this.executeWithRetry(
				() => client.makeRequest(transformedRequest),
				rule.retry || this.options.retry,
				request.id
			);
			
			// Apply response transformations (global then rule-specific)
			const transformedResponse = await this.applyResponseTransformations(response, request, rule);
			
			// Log successful request if enabled
			this.logRequest(request, transformedResponse, rule.upstreamUrl);
			
			return transformedResponse;
		} catch (error) {
			// Check if this is a transformation error
			if (error instanceof Error && error.message.includes('transformation failed')) {
				return this.createErrorResponse(
					request.id, 
					JsonRpcErrorCode.INTERNAL_ERROR, 
					error.message
				);
			}
			
			// Log failed request if enabled
			this.logError(request, error, rule.upstreamUrl);
			return this.handleUpstreamError(request.id, error);
		}
	}

	/**
	 * Handles errors from upstream servers
	 * @param id - Request ID
	 * @param error - Error from upstream request
	 * @returns JSON-RPC error response
	 */
	private handleUpstreamError(id: string | number | null | undefined, error: unknown): JsonRpcResponse {
		if (error instanceof Error) {
			// Handle specific error types from HttpClient
			if (error.message.startsWith('HTTP_ERROR:')) {
				return this.createErrorResponse(id, JsonRpcErrorCode.INTERNAL_ERROR, 'Upstream server error', { 
					type: 'HTTP_ERROR', 
					details: error.message 
				});
			}
			
			if (error.message.startsWith('TIMEOUT_ERROR:')) {
				return this.createErrorResponse(id, JsonRpcErrorCode.INTERNAL_ERROR, 'Upstream server timeout', {
					type: 'TIMEOUT_ERROR',
					details: error.message
				});
			}
			
			if (error.message.startsWith('NETWORK_ERROR:')) {
				return this.createErrorResponse(id, JsonRpcErrorCode.INTERNAL_ERROR, 'Network error connecting to upstream', {
					type: 'NETWORK_ERROR',
					details: error.message
				});
			}
			
			if (error.message.startsWith('PARSE_ERROR:') || error.message.startsWith('INVALID_RESPONSE:')) {
				return this.createErrorResponse(id, JsonRpcErrorCode.INTERNAL_ERROR, 'Invalid response from upstream server', {
					type: 'UPSTREAM_PARSE_ERROR',
					details: error.message
				});
			}
		}
		
		// Generic error fallback
		return this.createErrorResponse(id, JsonRpcErrorCode.INTERNAL_ERROR, 'Unknown upstream error', {
			type: 'UNKNOWN_ERROR',
			details: String(error)
		});
	}

	/**
	 * Validates ProxyHandlerOptions configuration
	 * @param options - Options to validate
	 * @throws Error if validation fails
	 */
	private validateOptions(options: ProxyHandlerOptions): void {
		if (options.defaultUrl && !this.isValidUrl(options.defaultUrl)) {
			throw new Error(`Invalid defaultUrl: ${options.defaultUrl}`);
		}
	}

	/**
	 * Validates ProxyHandlerRule configuration
	 * @param rule - Rule to validate
	 * @throws Error if validation fails
	 */
	private validateProxyRule(rule: ProxyHandlerRule): void {
		if (!rule.method || typeof rule.method !== 'string' || rule.method.trim() === '') {
			throw new Error('ProxyHandlerRule.method must be a non-empty string');
		}

		if (!rule.upstreamUrl || typeof rule.upstreamUrl !== 'string') {
			throw new Error('ProxyHandlerRule.upstreamUrl must be a non-empty string');
		}

		if (!this.isValidUrl(rule.upstreamUrl)) {
			throw new Error(`Invalid upstreamUrl: ${rule.upstreamUrl}`);
		}

		// Validate transformation functions
		if (rule.requestTransform && typeof rule.requestTransform !== 'function') {
			throw new Error('ProxyHandlerRule.requestTransform must be a function');
		}

		if (rule.responseTransform && typeof rule.responseTransform !== 'function') {
			throw new Error('ProxyHandlerRule.responseTransform must be a function');
		}

		// Validate transformation options
		if (rule.transformOptions) {
			const { priority, includeOriginalRequest, onTransformError } = rule.transformOptions;
			
			if (priority && !['before', 'after'].includes(priority)) {
				throw new Error('ProxyHandlerRule.transformOptions.priority must be "before" or "after"');
			}

			if (includeOriginalRequest !== undefined && typeof includeOriginalRequest !== 'boolean') {
				throw new Error('ProxyHandlerRule.transformOptions.includeOriginalRequest must be a boolean');
			}

			if (onTransformError && !['throw', 'skip', 'log-and-skip'].includes(onTransformError)) {
				throw new Error('ProxyHandlerRule.transformOptions.onTransformError must be "throw", "skip", or "log-and-skip"');
			}
		}
	}

	/**
	 * Validates JSON-RPC request format
	 * @param request - Request to validate
	 * @returns true if request is valid
	 */
	private validateJsonRpcRequest(request: unknown): request is JsonRpcRequest {
		if (typeof request !== 'object' || request === null) {
			return false;
		}

		const req = request as Record<string, unknown>;

		// Required fields
		if (req.jsonrpc !== '2.0') {
			return false;
		}

		if (typeof req.method !== 'string' || req.method.trim() === '') {
			return false;
		}

		// Optional id field - can be string, number, or null
		if (req.id !== undefined && req.id !== null && 
			typeof req.id !== 'string' && typeof req.id !== 'number') {
			return false;
		}

		// Optional params field - can be array or object
		if (req.params !== undefined && 
			!Array.isArray(req.params) && 
			(typeof req.params !== 'object' || req.params === null)) {
			return false;
		}

		return true;
	}

	/**
	 * Validates URL format
	 * @param url - URL string to validate
	 * @returns true if URL is valid
	 */
	private isValidUrl(url: string): boolean {
		try {
			const urlObj = new URL(url);
			return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
		} catch {
			return false;
		}
	}

	/**
	 * Gets HTTP client options for a specific rule
	 * @param rule - Proxy handler rule
	 * @returns HTTP client options
	 */
	private getClientOptions(rule: ProxyHandlerRule) {
		return {
			timeout: rule.timeout || this.options.timeout || 5000,
			headers: {
				...this.options.headers,
				...rule.headers
			}
		};
	}

	/**
	 * Executes request with retry logic
	 * @param requestFn - Function to execute the request
	 * @param retryConfig - Retry configuration
	 * @param requestId - Request ID for error reporting
	 * @returns Promise resolving to response
	 */
	private async executeWithRetry(
		requestFn: () => Promise<JsonRpcResponse>, 
		retryConfig?: { maxAttempts: number; delayMs: number; exponentialBackoff?: boolean },
		requestId?: string | number | null
	): Promise<JsonRpcResponse> {
		if (!retryConfig || retryConfig.maxAttempts <= 1) {
			return await requestFn();
		}

		let lastError: unknown;
		
		for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
			try {
				return await requestFn();
			} catch (error) {
				lastError = error;
				
				// Don't retry on the last attempt
				if (attempt === retryConfig.maxAttempts) {
					break;
				}
				
				// Calculate delay
				let delay = retryConfig.delayMs;
				if (retryConfig.exponentialBackoff) {
					delay = delay * Math.pow(2, attempt - 1);
				}
				
				// Log retry attempt if logging enabled
				if (this.options.enableLogging) {
					console.warn(`🔄 Retry attempt ${attempt}/${retryConfig.maxAttempts} for request ${requestId} after ${delay}ms delay`);
				}
				
				// Wait before next attempt
				await this.delay(delay);
			}
		}
		
		// All attempts failed, throw last error
		throw lastError;
	}

	/**
	 * Applies request transformations based on rule configuration and priority
	 * @param request - Original request
	 * @param rule - ProxyHandlerRule containing transformation configuration
	 * @returns Transformed request
	 */
	private async applyRequestTransformations(request: JsonRpcRequest, rule: ProxyHandlerRule): Promise<JsonRpcRequest> {
		let transformedRequest = request;
		const options = rule.transformOptions || {};
		const priority = options.priority || 'after';

		try {
			// Apply rule-specific transformation first if priority is 'before'
			if (priority === 'before' && rule.requestTransform) {
				transformedRequest = await this.safeTransform(
					rule.requestTransform,
					transformedRequest,
					'rule request transform',
					options.onTransformError || 'throw'
				) || transformedRequest;
			}

			// Apply global transformation
			if (this.options.requestTransform) {
				transformedRequest = await this.safeTransform(
					this.options.requestTransform,
					transformedRequest,
					'global request transform',
					'throw'
				) || transformedRequest;
			}

			// Apply rule-specific transformation after if priority is 'after' (default)
			if (priority === 'after' && rule.requestTransform) {
				transformedRequest = await this.safeTransform(
					rule.requestTransform,
					transformedRequest,
					'rule request transform',
					options.onTransformError || 'throw'
				) || transformedRequest;
			}

			return transformedRequest;
		} catch (error) {
			throw new Error(`Request transformation failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Applies response transformations based on rule configuration and priority
	 * @param response - Original response
	 * @param originalRequest - Original request for context
	 * @param rule - ProxyHandlerRule containing transformation configuration
	 * @returns Transformed response
	 */
	private async applyResponseTransformations(response: JsonRpcResponse, originalRequest: JsonRpcRequest, rule: ProxyHandlerRule): Promise<JsonRpcResponse> {
		let transformedResponse = response;
		const options = rule.transformOptions || {};
		const priority = options.priority || 'after';
		const includeOriginalRequest = options.includeOriginalRequest ?? true;

		try {
			// Apply rule-specific transformation first if priority is 'before'
			if (priority === 'before' && rule.responseTransform) {
				transformedResponse = await this.safeTransform(
					(resp) => rule.responseTransform!(resp, includeOriginalRequest ? originalRequest : undefined),
					transformedResponse,
					'rule response transform',
					options.onTransformError || 'throw'
				) || transformedResponse;
			}

			// Apply global transformation (legacy compatibility - no originalRequest parameter)
			if (this.options.responseTransform) {
				transformedResponse = await this.safeTransform(
					this.options.responseTransform,
					transformedResponse,
					'global response transform',
					'throw'
				) || transformedResponse;
			}

			// Apply rule-specific transformation after if priority is 'after' (default)
			if (priority === 'after' && rule.responseTransform) {
				transformedResponse = await this.safeTransform(
					(resp) => rule.responseTransform!(resp, includeOriginalRequest ? originalRequest : undefined),
					transformedResponse,
					'rule response transform',
					options.onTransformError || 'throw'
				) || transformedResponse;
			}

			return transformedResponse;
		} catch (error) {
			throw new Error(`Response transformation failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Safely executes a transformation function with error handling
	 * @param transformFn - Transformation function to execute
	 * @param data - Data to transform
	 * @param transformName - Name of transformation for logging
	 * @param errorStrategy - How to handle transformation errors
	 * @returns Transformed data or null if skipped
	 */
	private async safeTransform<T>(
		transformFn: (data: T) => T | Promise<T>,
		data: T,
		transformName: string,
		errorStrategy: 'throw' | 'skip' | 'log-and-skip'
	): Promise<T | null> {
		try {
			return await transformFn(data);
		} catch (error) {
			const errorMessage = `${transformName} failed: ${error instanceof Error ? error.message : String(error)}`;

			switch (errorStrategy) {
				case 'throw':
					throw new Error(errorMessage);
				case 'skip':
					return null;
				case 'log-and-skip':
					if (this.options.enableLogging) {
						console.warn(`⚠️ ${errorMessage} - skipping transformation`);
					}
					return null;
				default:
					throw new Error(errorMessage);
			}
		}
	}

	/**
	 * Logs successful request if logging is enabled
	 * @param request - Original request
	 * @param response - Response received
	 * @param upstreamUrl - Upstream server URL
	 */
	private logRequest(request: JsonRpcRequest, response: JsonRpcResponse, upstreamUrl: string): void {
		if (this.options.enableLogging) {
			console.log(`✅ ${request.method} [${request.id}] → ${upstreamUrl} (${response.error ? 'ERROR' : 'SUCCESS'})`);
		}
	}

	/**
	 * Logs failed request if logging is enabled
	 * @param request - Original request
	 * @param error - Error that occurred
	 * @param upstreamUrl - Upstream server URL
	 */
	private logError(request: JsonRpcRequest, error: unknown, upstreamUrl: string): void {
		if (this.options.enableLogging) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`❌ ${request.method} [${request.id}] → ${upstreamUrl} FAILED: ${errorMsg}`);
		}
	}

	/**
	 * Delays execution for specified milliseconds
	 * @param ms - Milliseconds to delay
	 * @returns Promise that resolves after delay
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Creates a JSON-RPC error response
	 * @param id - Request ID
	 * @param code - Error code  
	 * @param message - Error message
	 * @param data - Optional additional error data
	 * @returns JSON-RPC error response
	 */
	private createErrorResponse(id: string | number | null | undefined, code: JsonRpcErrorCode, message: string, data?: unknown): JsonRpcResponse {
		return {
			jsonrpc: '2.0',
			id: id ?? null,
			error: {
				code,
				message,
				data
			}
		};
	}

}
