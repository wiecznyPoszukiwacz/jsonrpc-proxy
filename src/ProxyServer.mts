import { Transport } from "./Transport.mjs";
import { JsonRpcRequest, JsonRpcResponse, JsonRpcErrorCode } from "./types.mjs";
import { RequestHandler } from "./RequestHandler.mjs";


export class ProxyServer {

	protected transports: Array<Transport> = []
	protected handlers: Array<RequestHandler> = []

	public constructor() {

	}

	/**
	 * Registers a transport for handling incoming requests
	 * @param transport - Transport instance to register
	 */
	public registerTransport(transport: Transport): void {
		transport.registerServer(this)
		this.transports.push(transport)
	}

	/**
	 * Registers a request handler
	 * @param handler - RequestHandler instance to register
	 */
	public registerHandler(handler: RequestHandler): void {
		this.handlers.push(handler)
	}

	/**
	 * Registers multiple request handlers
	 * @param handlers - Array of RequestHandler instances to register
	 */
	public registerHandlers(handlers: RequestHandler[]): void {
		this.handlers.push(...handlers)
	}

	/**
	 * Handles incoming JSON-RPC requests by routing through registered handlers
	 * @param request - JSON-RPC request to process
	 * @returns Promise resolving to JSON-RPC response
	 */
	public async handleReceivedMessage(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		// Find first handler that can process this request
		for (const handler of this.handlers) {
			try {
				if (await handler.canHandle(request)) {
					return await handler.handle(request)
				}
			} catch (error) {
				console.error(`❌ Handler error for method '${request.method}':`, error)
				// Continue to next handler instead of failing completely
			}
		}

		// No handler found for this method
		return this.createErrorResponse(
			request.id, 
			JsonRpcErrorCode.METHOD_NOT_FOUND, 
			`Method '${request.method}' not found`
		)
	}

	/**
	 * Starts all registered transports
	 */
	public async start(): Promise<void> {
		console.log(`🔧 Starting server with ${this.handlers.length} registered handlers`)
		this.transports.forEach(t => t.start())
	}

	/**
	 * Creates a JSON-RPC error response
	 * @param id - Request ID
	 * @param code - Error code
	 * @param message - Error message
	 * @returns JSON-RPC error response
	 */
	private createErrorResponse(id: string | number | null | undefined, code: JsonRpcErrorCode, message: string): JsonRpcResponse {
		return {
			jsonrpc: '2.0',
			id: id ?? null,
			error: {
				code,
				message
			}
		}
	}

}
