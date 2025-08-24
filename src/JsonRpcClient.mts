import { JsonRpcRequest, JsonRpcResponse } from "./types.mjs";

export abstract class JsonRpcClient {

	public abstract makeRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>

}
