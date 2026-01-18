// eslint-disable-next-line
const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	rootDir: process.cwd(),
	modulePathIgnorePatterns: ['<rootDir>/.history', '<rootDir>/dist'],
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
		legacyFakeTimers: true
	},
	setupFilesAfterEnv: ['./scripts/jest/setupJest.js']
};
