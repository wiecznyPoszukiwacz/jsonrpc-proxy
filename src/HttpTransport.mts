import { Transport, TTransportOptions } from "./Transport.mjs";
import http, { Server, IncomingMessage, ServerResponse } from 'node:http';
import { JsonRpcErrorCode, JsonRpcResponse } from "./types.mjs";


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

					// Forward request to proxy server and get response
					const response: JsonRpcResponse = await this.server?.handleReceivedMessage(jsonRpcRequest) ?? {
						id: jsonRpcRequest.id ?? null,
						jsonrpc: '2.0',
						error: {
							code: JsonRpcErrorCode.INTERNAL_ERROR,
							message: 'Server instance not available'
						}
					};

					res.write(JSON.stringify(response));
					res.end();

				} catch (exception) {
					console.error('Request processing error:', exception);
					this.handleHttpRequestError(res, exception);
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
	 * Handles HTTP-specific request processing errors
	 * @param res - HTTP response object
	 * @param error - The error that occurred
	 */
	protected handleHttpRequestError(res: ServerResponse, error: unknown): void {
		super.handleRequestError(error, (errorResponse) => {
			res.statusCode = 400;
			res.write(JSON.stringify(errorResponse));
			res.end();
		});
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
