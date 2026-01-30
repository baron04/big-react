import { defaults } from 'jest-config';

export default {
	...defaults,
	rootDir: process.cwd(),
	// We intentionally resolve React packages from `dist/` in tests.
	// Avoid haste-map package name collisions between `packages/*/package.json`
	// and `dist/*/package.json`.
	modulePathIgnorePatterns: [
		'<rootDir>/.history',
		'<rootDir>/dist/.*/package\\.json'
	],
	moduleDirectories: [
		// 对于 React ReactDOM
		'dist',
		// 对于第三方依赖
		...defaults.moduleDirectories
	],
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		'^scheduler$': '<rootDir>/node_modules/scheduler/unstable_mock.js'
	},
	fakeTimers: {
		enableGlobally: true,
		// jest-react 的 act 与现代 fake timers 不兼容（移除后 58 用例失败），保留旧实现
		legacyFakeTimers: true
	},
	setupFilesAfterEnv: ['./scripts/jest/setupJest.js']
};
