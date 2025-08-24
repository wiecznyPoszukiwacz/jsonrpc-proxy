import { JsonRpcClient } from "./JsonRpcClient.mjs";
import { JsonRpcRequest, JsonRpcResponse } from "./types.mjs";

/**
 * Configuration options for HTTP JSON-RPC client
 */
export interface HttpClientOptions {
	/** Request timeout in milliseconds (default: 5000) */
	timeout?: number;
	/** Additional HTTP headers to send with requests */
	headers?: Record<string, string>;
}

export class JsonRpcHttpClient extends JsonRpcClient {

	private readonly endpoint: string;
	private readonly options: HttpClientOptions;

	/**
	 * Creates a new HTTP JSON-RPC client
	 * @param endpoint - The HTTP endpoint URL for JSON-RPC server
	 * @param options - Optional configuration options
	 */
	public constructor(endpoint: string, options: HttpClientOptions = {}) {
		super();
		this.endpoint = endpoint;
		this.options = {
			timeout: 5000,
			...options
		};
	}

	/**
	 * Makes JSON-RPC request over HTTP using native fetch API
	 * @param request - JSON-RPC request object
	 * @returns Promise resolving to JSON-RPC response
	 * @throws Error for network issues or invalid responses
	 */
	public async makeRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.options.timeout);

		try {
			// Prepare headers
			const headers: HeadersInit = {
				'Content-Type': 'application/json',
				...this.options.headers
			};

			// Make HTTP request
			const response = await fetch(this.endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify(request),
				signal: controller.signal
			});

			clearTimeout(timeout);

			// Check HTTP status
			if (!response.ok) {
				throw new Error(`HTTP_ERROR: Server returned status ${response.status}: ${response.statusText}`);
			}

			// Parse response as JSON
			const responseText = await response.text();
			let jsonResponse: unknown;

			try {
				jsonResponse = JSON.parse(responseText);
			} catch (parseError) {
				throw new Error(`PARSE_ERROR: Invalid JSON response - ${parseError}`);
			}

			// Validate and return JSON-RPC response
			const validatedResponse = this.validateJsonRpcResponse(jsonResponse, request.id);
			return validatedResponse;

		} catch (error) {
			clearTimeout(timeout);
			
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					throw new Error(`TIMEOUT_ERROR: Request timeout after ${this.options.timeout}ms`);
				}
				
				// Re-throw existing errors
				throw error;
			}

			// Handle unknown errors
			throw new Error(`NETWORK_ERROR: ${String(error)}`);
		}
	}

	/**
	 * Validates that response object is a valid JSON-RPC response
	 * @param response - Parsed response object
	 * @param expectedId - Expected request ID
	 * @returns Validated JsonRpcResponse
	 * @throws Error if response is invalid
	 */
	private validateJsonRpcResponse(response: unknown, expectedId?: string | number | null): JsonRpcResponse {
		if (typeof response !== 'object' || response === null) {
			throw new Error('INVALID_RESPONSE: Response must be an object');
		}

		const jsonResponse = response as Record<string, unknown>;

		// Validate jsonrpc field
		if (jsonResponse.jsonrpc !== '2.0') {
			throw new Error('INVALID_RESPONSE: jsonrpc field must be "2.0"');
		}

		// Validate id field matches request
		if (jsonResponse.id !== expectedId) {
			throw new Error(`INVALID_RESPONSE: Response ID "${jsonResponse.id}" does not match request ID "${expectedId}"`);
		}

		// Must have either result or error (but not both)
		const hasResult = 'result' in jsonResponse;
		const hasError = 'error' in jsonResponse;

		if (!hasResult && !hasError) {
			throw new Error('INVALID_RESPONSE: Response must contain either result or error field');
		}

		if (hasResult && hasError) {
			throw new Error('INVALID_RESPONSE: Response cannot contain both result and error fields');
		}

		// Validate error structure if present
		if (hasError) {
			this.validateJsonRpcError(jsonResponse.error);
		}

		return jsonResponse as unknown as JsonRpcResponse;
	}

	/**
	 * Validates JSON-RPC error object structure
	 * @param error - Error object to validate
	 * @throws Error if error structure is invalid
	 */
	private validateJsonRpcError(error: unknown): void {
		if (typeof error !== 'object' || error === null) {
			throw new Error('INVALID_RESPONSE: Error field must be an object');
		}

		const errorObj = error as Record<string, unknown>;

		// Validate required fields
		if (typeof errorObj.code !== 'number') {
			throw new Error('INVALID_RESPONSE: Error code must be a number');
		}

		if (typeof errorObj.message !== 'string') {
			throw new Error('INVALID_RESPONSE: Error message must be a string');
		}

		// data field is optional and can be any type
	}

}
