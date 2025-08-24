import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CustomHandlerLoader } from './CustomHandlerLoader.mjs';

describe('CustomHandlerLoader', () => {
	const testDir = 'test-custom-rules';
	let loader: CustomHandlerLoader;

	beforeEach(async () => {
		// Clean up test directory
		try {
			await fs.rmdir(testDir, { recursive: true });
		} catch {
			// Directory doesn't exist, continue
		}
		
		loader = new CustomHandlerLoader({
			customRulesDirectory: testDir,
			enableLogging: false
		});
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rmdir(testDir, { recursive: true });
		} catch {
			// Directory doesn't exist, continue
		}
	});

	describe('loadHandlers', () => {
		it('should create directory if it does not exist', async () => {
			const handlers = await loader.loadHandlers();
			
			expect(handlers).toEqual([]);
			
			// Verify directory was created
			const dirStats = await fs.stat(testDir);
			expect(dirStats.isDirectory()).toBe(true);
		});

		it('should return empty array when no handler files exist', async () => {
			await fs.mkdir(testDir, { recursive: true });
			
			const handlers = await loader.loadHandlers();
			
			expect(handlers).toEqual([]);
		});

		it('should load handlers in alphabetical order', async () => {
			await fs.mkdir(testDir, { recursive: true });
			
			// Create test handler files (reverse alphabetical order to test sorting)
			await fs.writeFile(
				join(testDir, '02-second.mjs'),
				`
				import { RequestHandler } from '../src/RequestHandler.mjs';
				export default class SecondHandler extends RequestHandler {
					async canHandle(request) { return request.method === 'second'; }
					async handle(request) { return { jsonrpc: '2.0', id: request.id, result: 'second' }; }
				}
				`
			);
			
			await fs.writeFile(
				join(testDir, '01-first.mjs'),
				`
				import { RequestHandler } from '../src/RequestHandler.mjs';
				export default class FirstHandler extends RequestHandler {
					async canHandle(request) { return request.method === 'first'; }
					async handle(request) { return { jsonrpc: '2.0', id: request.id, result: 'first' }; }
				}
				`
			);

			const handlers = await loader.loadHandlers();
			
			expect(handlers).toHaveLength(2);
			expect(handlers[0]?.constructor.name).toBe('FirstHandler');
			expect(handlers[1]?.constructor.name).toBe('SecondHandler');
		});

		it('should handle files with multiple handlers export', async () => {
			await fs.mkdir(testDir, { recursive: true });
			
			await fs.writeFile(
				join(testDir, '01-multi.mjs'),
				`
				import { RequestHandler } from '../src/RequestHandler.mjs';
				
				class Handler1 extends RequestHandler {
					async canHandle(request) { return request.method === 'test1'; }
					async handle(request) { return { jsonrpc: '2.0', id: request.id, result: 'test1' }; }
				}
				
				class Handler2 extends RequestHandler {
					async canHandle(request) { return request.method === 'test2'; }
					async handle(request) { return { jsonrpc: '2.0', id: request.id, result: 'test2' }; }
				}
				
				export const handlers = [new Handler1(), new Handler2()];
				`
			);

			const handlers = await loader.loadHandlers();
			
			expect(handlers).toHaveLength(2);
		});

		it('should continue loading other files when one file fails', async () => {
			await fs.mkdir(testDir, { recursive: true });
			
			// Create a valid handler
			await fs.writeFile(
				join(testDir, '01-valid.mjs'),
				`
				import { RequestHandler } from '../src/RequestHandler.mjs';
				export default class ValidHandler extends RequestHandler {
					async canHandle(request) { return request.method === 'valid'; }
					async handle(request) { return { jsonrpc: '2.0', id: request.id, result: 'valid' }; }
				}
				`
			);
			
			// Create an invalid handler file
			await fs.writeFile(
				join(testDir, '02-invalid.mjs'),
				'this is not valid javascript'
			);
			
			// Create another valid handler
			await fs.writeFile(
				join(testDir, '03-valid2.mjs'),
				`
				import { RequestHandler } from '../src/RequestHandler.mjs';
				export default class Valid2Handler extends RequestHandler {
					async canHandle(request) { return request.method === 'valid2'; }
					async handle(request) { return { jsonrpc: '2.0', id: request.id, result: 'valid2' }; }
				}
				`
			);

			const handlers = await loader.loadHandlers();
			
			// Should load 2 valid handlers despite the invalid one
			expect(handlers).toHaveLength(2);
			expect(handlers[0]?.constructor.name).toBe('ValidHandler');
			expect(handlers[1]?.constructor.name).toBe('Valid2Handler');
		});

		it('should filter files by include patterns', async () => {
			loader = new CustomHandlerLoader({
				customRulesDirectory: testDir,
				includePatterns: ['*.mts'],
				enableLogging: false
			});
			
			await fs.mkdir(testDir, { recursive: true });
			
			// Create .mjs file (should be excluded)
			await fs.writeFile(
				join(testDir, '01-excluded.mjs'),
				`
				import { RequestHandler } from '../src/RequestHandler.mjs';
				export default class ExcludedHandler extends RequestHandler {
					async canHandle(request) { return false; }
					async handle(request) { return { jsonrpc: '2.0', id: request.id, result: 'excluded' }; }
				}
				`
			);
			
			// Create .mts file (should be included but won't work in runtime)
			await fs.writeFile(join(testDir, '02-included.mts'), 'export default class Test {}');

			const handlers = await loader.loadHandlers();
			
			// Should try to load the .mts file but fail (we expect 0 handlers)
			expect(handlers).toHaveLength(0);
		});
	});
});