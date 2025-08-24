import { ProxyHandler } from '../dist/commonHandlers/ProxyHandler.mjs';

/**
 * Example ProxyHandler with various transformation rules
 * Demonstrates body transformation capabilities for different scenarios
 */

/**
 * Creates a ProxyHandler with transformation examples
 * @returns {ProxyHandler} Configured proxy handler with transformation rules
 */
function createTransformationHandler() {
	const handler = new ProxyHandler({
		enableLogging: true,
		// Global transformation - applied to all requests/responses
		requestTransform: (request) => {
			// Add global headers or metadata to all requests
			return {
				...request,
				params: {
					...request.params,
					_timestamp: Date.now(),
					_source: 'jsonrpc-proxy'
				}
			};
		},
		responseTransform: (response) => {
			// Add processing time to all responses  
			return {
				...response,
				result: {
					...response.result,
					_processedAt: new Date().toISOString()
				}
			};
		}
	});

	// User service - parameter validation and data sanitization
	handler.addHandlerRule({
		method: 'user.create',
		upstreamUrl: 'http://user-service:3001/jsonrpc',
		requestTransform: async (request) => {
			// Validate and normalize user creation parameters
			if (request.params && typeof request.params === 'object') {
				const params = request.params;
				
				// Add default values
				params.status = params.status || 'active';
				params.createdAt = new Date().toISOString();
				
				// Validate required fields
				if (!params.email || !params.username) {
					throw new Error('Missing required fields: email and username');
				}
				
				// Normalize email
				params.email = params.email.toLowerCase().trim();
			}
			return request;
		},
		responseTransform: async (response, originalRequest) => {
			// Remove sensitive data from response
			if (response.result && typeof response.result === 'object') {
				const result = response.result;
				delete result.passwordHash;
				delete result.internalId;
				
				// Add audit information
				result.audit = {
					createdBy: 'proxy',
					originalMethod: originalRequest?.method
				};
			}
			return response;
		},
		transformOptions: {
			priority: 'before', // Apply before global transformations
			includeOriginalRequest: true,
			onTransformError: 'throw'
		}
	});

	// Legacy API - data format conversion
	handler.addHandlerRule({
		method: 'legacy.getData',
		upstreamUrl: 'http://legacy-service:3002/api',
		requestTransform: async (request) => {
			// Convert modern API format to legacy format
			return {
				...request,
				method: 'legacy_get_data', // Different method name convention
				params: convertToLegacyFormat(request.params)
			};
		},
		responseTransform: async (response) => {
			// Convert legacy response back to modern format
			if (response.result) {
				response.result = convertFromLegacyFormat(response.result);
			}
			return response;
		},
		transformOptions: {
			priority: 'after',
			onTransformError: 'log-and-skip' // Don't fail the request if conversion fails
		}
	});

	// Analytics service - data enrichment with error handling
	handler.addHandlerRule({
		method: 'analytics.track',
		upstreamUrl: 'http://analytics-service:3003/jsonrpc',
		requestTransform: async (request) => {
			// Enrich analytics data with additional context
			if (request.params && typeof request.params === 'object') {
				request.params = {
					...request.params,
					enriched: {
						userAgent: 'jsonrpc-proxy/1.0',
						timestamp: Date.now(),
						sessionId: generateSessionId()
					}
				};
			}
			return request;
		},
		responseTransform: async (response, originalRequest) => {
			// Add tracking confirmation
			if (response.result) {
				response.result = {
					...response.result,
					trackingConfirmed: true,
					originalEventType: originalRequest?.params?.eventType
				};
			}
			return response;
		},
		transformOptions: {
			priority: 'after',
			includeOriginalRequest: true,
			onTransformError: 'skip' // Skip transformation but continue with request
		}
	});

	// Payment service - strict validation with error handling
	handler.addHandlerRule({
		method: 'payment.process',
		upstreamUrl: 'http://payment-service:3004/jsonrpc',
		requestTransform: async (request) => {
			// Strict validation for payment requests
			if (!request.params || typeof request.params !== 'object') {
				throw new Error('Payment request must have params');
			}

			const params = request.params;
			
			// Validate required payment fields
			const requiredFields = ['amount', 'currency', 'customerId'];
			for (const field of requiredFields) {
				if (!params[field]) {
					throw new Error(`Missing required payment field: ${field}`);
				}
			}

			// Normalize amount to cents
			if (typeof params.amount === 'number') {
				params.amount = Math.round(params.amount * 100);
			}

			// Add security fields
			params.securityToken = generateSecurityToken();
			params.requestId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			return request;
		},
		responseTransform: async (response) => {
			// Sanitize payment response
			if (response.result && typeof response.result === 'object') {
				const result = response.result;
				
				// Remove sensitive payment data
				delete result.internalTransactionId;
				delete result.providerSecrets;
				
				// Convert amount back from cents
				if (typeof result.amount === 'number') {
					result.amount = result.amount / 100;
				}
			}
			return response;
		},
		transformOptions: {
			priority: 'before',
			includeOriginalRequest: false, // No need for original request in response transform
			onTransformError: 'throw' // Always fail on transformation errors for payments
		}
	});

	return handler;
}

/**
 * Helper function to convert modern format to legacy format
 * @param {unknown} params - Parameters to convert
 * @returns {unknown} Converted parameters
 */
function convertToLegacyFormat(params) {
	if (!params || typeof params !== 'object') {
		return params;
	}

	// Example conversion: camelCase to snake_case
	const converted = {};
	for (const [key, value] of Object.entries(params)) {
		const legacyKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
		converted[legacyKey] = value;
	}
	return converted;
}

/**
 * Helper function to convert legacy format back to modern format
 * @param {unknown} data - Data to convert
 * @returns {unknown} Converted data
 */
function convertFromLegacyFormat(data) {
	if (!data || typeof data !== 'object') {
		return data;
	}

	// Example conversion: snake_case to camelCase
	const converted = {};
	for (const [key, value] of Object.entries(data)) {
		const modernKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
		converted[modernKey] = value;
	}
	return converted;
}

/**
 * Generate a simple session ID
 * @returns {string} Session ID
 */
function generateSessionId() {
	return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a security token (placeholder implementation)
 * @returns {string} Security token
 */
function generateSecurityToken() {
	return `tok_${Math.random().toString(36).substr(2, 16)}`;
}

// Export the configured handler
export default createTransformationHandler();