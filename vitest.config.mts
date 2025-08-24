import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/**',
				'dist/**',
				'**/*.d.ts',
				'**/*.config.*',
				'**/*.test.*'
			]
		}
	},
	resolve: {
		alias: {
			'@': new URL('./src', import.meta.url).pathname
		}
	}
});