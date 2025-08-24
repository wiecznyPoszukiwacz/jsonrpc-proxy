
/**
 * JSON-RPC request structure
 */
export interface JsonRpcRequest {
	id?: string | number | null;
	jsonrpc: '2.0';
	method: string;
	params?: unknown[] | Record<string, unknown>;
}

/**
 * JSON-RPC response structure
 */
export interface JsonRpcResponse {
	id?: string | number | null;
	jsonrpc: '2.0';
	result?: unknown;
	error?: JsonRpcError;
}

/**
 * JSON-RPC error structure
 */
export interface JsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

/**
 * JSON-RPC error codes according to specification
 */
export enum JsonRpcErrorCode {
	PARSE_ERROR = -32700,
	INVALID_REQUEST = -32600,
	METHOD_NOT_FOUND = -32601,
	INVALID_PARAMS = -32602,
	INTERNAL_ERROR = -32603
}

/**
 * Custom handler module export structure - single handler
 */
export interface CustomHandlerModule {
	default: new (...args: any[]) => import('./RequestHandler.mjs').RequestHandler;
}

/**
 * Custom handler module export structure - multiple handlers
 */
export interface CustomHandlerArrayModule {
	handlers: import('./RequestHandler.mjs').RequestHandler[];
}

/**
 * Union type for custom handler module exports
 */
export type CustomHandlerModuleExport = CustomHandlerModule | CustomHandlerArrayModule;

/**
 * Transformation function type for JSON-RPC requests
 */
export type RequestTransformFunction = (request: JsonRpcRequest) => JsonRpcRequest | Promise<JsonRpcRequest>;

/**
 * Transformation function type for JSON-RPC responses
 */
export type ResponseTransformFunction = (
	response: JsonRpcResponse, 
	originalRequest?: JsonRpcRequest
) => JsonRpcResponse | Promise<JsonRpcResponse>;

/**
 * Transformation options for fine-grained control over transformation behavior
 */
export interface TransformOptions {
	/** Priority of transformation execution relative to global transformations */
	priority?: 'before' | 'after';
	/** Whether to pass the original request to response transformation */
	includeOriginalRequest?: boolean;
	/** Error handling strategy for transformation failures */
	onTransformError?: 'throw' | 'skip' | 'log-and-skip';
}

/**
 * Configuration options for custom handler loader
 */
export interface CustomHandlerLoaderOptions {
	/** Directory path to scan for custom handlers */
	customRulesDirectory?: string;
	/** Whether to enable verbose logging during loading */
	enableLogging?: boolean;
	/** File patterns to include (default: ['*.mts', '*.mjs']) */
	includePatterns?: string[];
	/** File patterns to exclude */
	excludePatterns?: string[];
}
