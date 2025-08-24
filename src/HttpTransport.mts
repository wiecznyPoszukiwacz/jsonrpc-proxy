import { Transport, TTransportOptions } from "./Transport.mjs";
import http, { Server, IncomingMessage, ServerResponse } from 'node:http';

/**
 * JSON-RPC request structure
 */
interface JsonRpcRequest {
	id?: string | number | null;
	jsonrpc: '2.0';
	method: string;
	params?: unknown[] | Record<string, unknown>;
}

/**
 * JSON-RPC response structure
 */
interface JsonRpcResponse {
	id?: string | number | null;
	jsonrpc: '2.0';
	result?: unknown;
	error?: JsonRpcError;
}

/**
 * JSON-RPC error structure
 */
interface JsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

/**
 * JSON-RPC error codes according to specification
 */
enum JsonRpcErrorCode {
	PARSE_ERROR = -32700,
	INVALID_REQUEST = -32600,
	METHOD_NOT_FOUND = -32601,
	INVALID_PARAMS = -32602,
	INTERNAL_ERROR = -32603
}

export class HttpTransport extends Transport {

	protected httpServer: Server | null = null;

	public constructor(protected override options: TTransportOptions) {
		super(options)

	}

	public override async start(): Promise<Transport> {
		await this.setupHttpServer()
		return this
	}

	protected async setupHttpServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.httpServer = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
				this.setResponseHeaders(res);

				if (req.method !== 'POST') {
					this.sendErrorResponse(res, JsonRpcErrorCode.INVALID_REQUEST, 'Only POST method allowed', null);
					return;
				}

				try {
					this.validateHeaders(req);
					const body = await this.parseRequestBody(req);
					const jsonRpcRequest = this.validateRequestBodyAsJsonRpcCall(body);
					
					// TODO: Forward request to proxy server and get response
					const response: JsonRpcResponse = {
						id: jsonRpcRequest.id ?? null,
						jsonrpc: '2.0',
						result: 'Method execution pending'
					};

					res.write(JSON.stringify(response));
					res.end();

				} catch (exception) {
					console.error('Request processing error:', exception);
					this.handleRequestError(res, exception);
				}
			});

			this.httpServer.listen(this.options.port, () => {
				console.log(`🌐 HTTP server listening on port ${this.options.port}`);
				resolve();
			});

			this.httpServer.on('error', (error) => {
				console.error('HTTP server error:', error);
				reject(error);
			});
		});
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
	 * Validates HTTP headers for JSON-RPC request
	 * @param req - HTTP request object
	 * @throws Error when headers are not valid
	 */
	protected validateHeaders(req: IncomingMessage): void {
		const contentType = req.headers['content-type'];
		
		if (!contentType || !contentType.includes('application/json')) {
			throw new Error('INVALID_REQUEST: Content-Type must be application/json');
		}
	}

	/**
	 * Parses HTTP request body
	 * @param req - HTTP request object
	 * @returns Promise with parsed body string
	 */
	protected async parseRequestBody(req: IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let body = '';
			
			req.on('data', (chunk) => {
				body += chunk.toString();
			});
			
			req.on('end', () => {
				if (body.trim() === '') {
					reject(new Error('INVALID_REQUEST: Request body cannot be empty'));
				} else {
					resolve(body);
				}
			});
			
			req.on('error', (error) => {
				reject(new Error(`PARSE_ERROR: Failed to read request body - ${error.message}`));
			});
		});
	}

	/**
	 * Sets appropriate response headers for JSON-RPC
	 * @param res - HTTP response object
	 */
	protected setResponseHeaders(res: ServerResponse): void {
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	}

	/**
	 * Handles request processing errors
	 * @param res - HTTP response object
	 * @param error - The error that occurred
	 */
	protected handleRequestError(res: ServerResponse, error: unknown): void {
		const exception = error instanceof Error ? error : new Error(String(error));
		const errorResponse = this.prepareErrorResponse(exception);
		
		res.statusCode = 400;
		res.write(JSON.stringify(errorResponse));
		res.end();
	}

	/**
	 * Sends error response with specific error code
	 * @param res - HTTP response object
	 * @param code - JSON-RPC error code
	 * @param message - Error message
	 * @param id - Request ID
	 */
	protected sendErrorResponse(
		res: ServerResponse, 
		code: JsonRpcErrorCode, 
		message: string, 
		id: string | number | null
	): void {
		const errorResponse: JsonRpcResponse = {
			id,
			jsonrpc: '2.0',
			error: {
				code,
				message,
				data: undefined
			}
		};

		res.statusCode = 400;
		res.write(JSON.stringify(errorResponse));
		res.end();
	}

	/**
	 * Gracefully shutdown the HTTP server
	 */
	public async shutdown(): Promise<void> {
		return new Promise((resolve) => {
			if (this.httpServer) {
				this.httpServer.close(() => {
					console.log('🔌 HTTP server closed');
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

}
