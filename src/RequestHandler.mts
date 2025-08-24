import { JsonRpcRequest, JsonRpcResponse } from "./types.mjs";

export abstract class RequestHandler {

	/**
	 * Determines if this handler can process the given request
	 * @param request - JSON-RPC request to evaluate
	 * @returns Promise resolving to true if handler can process request
	 */
	public abstract canHandle(request: JsonRpcRequest): Promise<boolean>

	/**
	 * Processes the JSON-RPC request and returns response
	 * @param request - JSON-RPC request to handle
	 * @returns Promise resolving to JSON-RPC response
	 */
	public abstract handle(request: JsonRpcRequest): Promise<JsonRpcResponse>

}
