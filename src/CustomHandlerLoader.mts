import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { pathToFileURL } from 'url';
import { RequestHandler } from './RequestHandler.mjs';
import { CustomHandlerLoaderOptions, CustomHandlerModuleExport } from './types.mjs';

/**
 * Loads custom request handlers from a specified directory
 * Supports both single handler exports (default export) and multiple handler exports (handlers array)
 */
export class CustomHandlerLoader {

	private readonly options: Required<CustomHandlerLoaderOptions>;

	/**
	 * Creates new CustomHandlerLoader instance
	 * @param options - Configuration options for the loader
	 */
	public constructor(options: CustomHandlerLoaderOptions = {}) {
		this.options = {
			customRulesDirectory: options.customRulesDirectory ?? 'customRules',
			enableLogging: options.enableLogging ?? false,
			includePatterns: options.includePatterns ?? ['*.mts', '*.mjs'],
			excludePatterns: options.excludePatterns ?? []
		};
	}

	/**
	 * Loads all custom handlers from the configured directory
	 * @returns Promise resolving to array of loaded RequestHandler instances
	 */
	public async loadHandlers(): Promise<RequestHandler[]> {
		const handlers: RequestHandler[] = [];

		try {
			await this.ensureDirectoryExists();
			const files = await this.getHandlerFiles();
			
			if (this.options.enableLogging) {
				console.log(`📂 Found ${files.length} handler files in ${this.options.customRulesDirectory}`);
			}

			for (const file of files) {
				try {
					const fileHandlers = await this.loadHandlerFile(file);
					handlers.push(...fileHandlers);
					
					if (this.options.enableLogging) {
						console.log(`✅ Loaded ${fileHandlers.length} handler(s) from ${file}`);
					}
				} catch (error) {
					console.error(`❌ Failed to load handlers from ${file}:`, error);
					// Continue loading other files instead of stopping
				}
			}

		} catch (error) {
			console.error(`❌ Failed to load custom handlers from ${this.options.customRulesDirectory}:`, error);
		}

		if (this.options.enableLogging) {
			console.log(`🔧 Successfully loaded ${handlers.length} custom handlers total`);
		}

		return handlers;
	}

	/**
	 * Ensures the custom rules directory exists, creates it if not
	 */
	private async ensureDirectoryExists(): Promise<void> {
		try {
			await fs.access(this.options.customRulesDirectory);
		} catch {
			// Directory doesn't exist, create it
			await fs.mkdir(this.options.customRulesDirectory, { recursive: true });
			if (this.options.enableLogging) {
				console.log(`📁 Created custom rules directory: ${this.options.customRulesDirectory}`);
			}
		}
	}

	/**
	 * Gets all handler files from the directory, sorted alphabetically
	 * @returns Promise resolving to sorted array of file paths
	 */
	private async getHandlerFiles(): Promise<string[]> {
		const files = await fs.readdir(this.options.customRulesDirectory);
		
		return files
			.filter(file => this.matchesIncludePatterns(file))
			.filter(file => !this.matchesExcludePatterns(file))
			.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
			.map(file => join(this.options.customRulesDirectory, file));
	}

	/**
	 * Checks if file matches any of the include patterns
	 * @param filename - File name to check
	 * @returns true if file matches include patterns
	 */
	private matchesIncludePatterns(filename: string): boolean {
		return this.options.includePatterns.some(pattern => 
			this.matchesPattern(filename, pattern)
		);
	}

	/**
	 * Checks if file matches any of the exclude patterns
	 * @param filename - File name to check
	 * @returns true if file matches exclude patterns
	 */
	private matchesExcludePatterns(filename: string): boolean {
		return this.options.excludePatterns.some(pattern => 
			this.matchesPattern(filename, pattern)
		);
	}

	/**
	 * Simple pattern matching for file extensions
	 * @param filename - File name to check
	 * @param pattern - Pattern to match (e.g., '*.mts')
	 * @returns true if filename matches pattern
	 */
	private matchesPattern(filename: string, pattern: string): boolean {
		if (pattern.startsWith('*.')) {
			const extension = pattern.substring(1);
			return extname(filename) === extension;
		}
		return filename === pattern;
	}

	/**
	 * Loads handlers from a specific file
	 * @param filePath - Path to the handler file
	 * @returns Promise resolving to array of RequestHandler instances
	 */
	private async loadHandlerFile(filePath: string): Promise<RequestHandler[]> {
		// Convert file path to file URL for ES module import
		const fileUrl = pathToFileURL(filePath).href;
		
		// Dynamic import of the handler module
		const module = await import(fileUrl) as CustomHandlerModuleExport;
		
		// Check if module has handlers array export
		if ('handlers' in module && Array.isArray(module.handlers)) {
			return this.validateHandlers(module.handlers, filePath);
		}
		
		// Check if module has default export (single handler)
		if ('default' in module) {
			const HandlerClass = module.default;
			if (this.isHandlerConstructor(HandlerClass)) {
				const handler = new HandlerClass();
				this.validateHandler(handler, filePath);
				return [handler];
			}
		}

		throw new Error(`Invalid handler module format in ${filePath}. Expected 'default' export (handler class) or 'handlers' export (array of handlers)`);
	}

	/**
	 * Validates that a constructor is a RequestHandler class
	 * @param constructor - Constructor function to validate
	 * @returns true if constructor is valid RequestHandler class
	 */
	private isHandlerConstructor(constructor: any): constructor is new (...args: any[]) => RequestHandler {
		return typeof constructor === 'function';
	}

	/**
	 * Validates array of handlers
	 * @param handlers - Array of potential RequestHandler instances
	 * @param filePath - File path for error reporting
	 * @returns Validated array of RequestHandler instances
	 */
	private validateHandlers(handlers: unknown[], filePath: string): RequestHandler[] {
		return handlers.map((handler, index) => {
			this.validateHandler(handler, `${filePath}[${index}]`);
			return handler as RequestHandler;
		});
	}

	/**
	 * Validates that an object is a RequestHandler instance
	 * @param handler - Object to validate
	 * @param source - Source identifier for error reporting
	 * @throws Error if handler is not valid RequestHandler
	 */
	private validateHandler(handler: unknown, source: string): void {
		if (!handler || typeof handler !== 'object') {
			throw new Error(`Handler from ${source} is not an object`);
		}

		const h = handler as any;
		
		if (typeof h.canHandle !== 'function') {
			throw new Error(`Handler from ${source} missing required 'canHandle' method`);
		}

		if (typeof h.handle !== 'function') {
			throw new Error(`Handler from ${source} missing required 'handle' method`);
		}

		// Check if it's actually extending RequestHandler (best effort)
		if (!(handler instanceof RequestHandler)) {
			console.warn(`⚠️  Handler from ${source} does not extend RequestHandler class`);
		}
	}
}