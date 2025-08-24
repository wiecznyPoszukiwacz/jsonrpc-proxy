import { ProxyServer } from "./ProxyServer.mjs"
import { JsonRpcRequest, JsonRpcResponse, JsonRpcErrorCode } from "./types.mjs"

export type TTransportOptions = {
	port: number
}
export abstract class Transport {

	protected server!: ProxyServer

	public abstract start(): Promise<Transport>

	public constructor(protected options: TTransportOptions) {
	}

	public registerServer(server: ProxyServer): Transport {
		this.server = server
		return this
	}

	/**
	 * Validates and parses request body as JSON-RPC call
	 * @param body - Raw request body string
	 * @returns Parsed and validated JSON-RPC request
	 * @throws Error when body is not valid JSON-RPC request
	 */
	protected validateRequestBodyAsJsonRpcCall(body: string): JsonRpcRequest {
		let parsed: unknown;

		try {
			parsed = JSON.parse(body);
		} catch (error) {
			throw new Error(`PARSE_ERROR: Invalid JSON - ${error}`);
		}

		if (typeof parsed !== 'object' || parsed === null) {
			throw new Error('INVALID_REQUEST: Request must be an object');
		}

		const request = parsed as Record<string, unknown>;

		// Validate required fields
		if (request.jsonrpc !== '2.0') {
			throw new Error('INVALID_REQUEST: jsonrpc field must be "2.0"');
		}

		if (typeof request.method !== 'string' || request.method.trim() === '') {
			throw new Error('INVALID_REQUEST: method field must be a non-empty string');
		}

		// Validate id if present
		if (request.id !== undefined && request.id !== null &&
			typeof request.id !== 'string' && typeof request.id !== 'number') {
			throw new Error('INVALID_REQUEST: id must be string, number, or null');
		}

		// Validate params if present
		if (request.params !== undefined &&
			!Array.isArray(request.params) &&
			(typeof request.params !== 'object' || request.params === null)) {
			throw new Error('INVALID_REQUEST: params must be array or object');
		}

		return request as unknown as JsonRpcRequest;
	}

	/**
	 * Prepares JSON-RPC error response from exception
	 * @param exception - The error that occurred
	 * @param id - Request ID for the response
	 * @returns JSON-RPC error response
	 */
	protected prepareErrorResponse(exception: Error, id?: string | number | null): JsonRpcResponse {
		let errorCode: number;
		let errorMessage: string;
		let errorData: unknown = undefined;

		const errorMsg = exception.message;

		if (errorMsg.startsWith('PARSE_ERROR:')) {
			errorCode = JsonRpcErrorCode.PARSE_ERROR;
			errorMessage = 'Parse error';
			errorData = errorMsg.replace('PARSE_ERROR: ', '');
		} else if (errorMsg.startsWith('INVALID_REQUEST:')) {
			errorCode = JsonRpcErrorCode.INVALID_REQUEST;
			errorMessage = 'Invalid Request';
			errorData = errorMsg.replace('INVALID_REQUEST: ', '');
		} else if (errorMsg.startsWith('METHOD_NOT_FOUND:')) {
			errorCode = JsonRpcErrorCode.METHOD_NOT_FOUND;
			errorMessage = 'Method not found';
			errorData = errorMsg.replace('METHOD_NOT_FOUND: ', '');
		} else if (errorMsg.startsWith('INVALID_PARAMS:')) {
			errorCode = JsonRpcErrorCode.INVALID_PARAMS;
			errorMessage = 'Invalid params';
			errorData = errorMsg.replace('INVALID_PARAMS: ', '');
		} else {
			errorCode = JsonRpcErrorCode.INTERNAL_ERROR;
			errorMessage = 'Internal error';
			errorData = errorMsg;
		}

		return {
			id: id ?? null,
			jsonrpc: '2.0',
			error: {
				code: errorCode,
				message: errorMessage,
				data: errorData
			}
		};
	}

	/**
	 * Handles request processing errors - generic version
	 * @param error - The error that occurred
	 * @param sendResponse - Callback function to send the response
	 * @param id - Optional request ID for error response
	 */
	protected handleRequestError<T>(
		error: unknown, 
		sendResponse: (response: JsonRpcResponse) => T,
		id?: string | number | null
	): T {
		const exception = error instanceof Error ? error : new Error(String(error));
		const errorResponse = this.prepareErrorResponse(exception, id);
		return sendResponse(errorResponse);
	}

}
