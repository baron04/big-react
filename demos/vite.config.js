import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import replace from '@rollup/plugin-replace';
import path from 'path';

// 可选值：'big-react'（仓库内的自制 react 实现）或 'official'（npm 中的官方实现）
const reactImplementation = 'big-react';
const useBigReact = reactImplementation === 'big-react';
// 仅在使用 big-react 时生效。选择 'noop' 时，demo 入口使用 react-noop-renderer
const renderer = 'dom'; // 可选值：'dom' 或 'noop'

function resolvePackage(pkgName) {
	return path.resolve(__dirname, '../packages', pkgName);
}

// https://vitejs.dev/config/
export default defineConfig({
	root: __dirname,
	plugins: [
		...(useBigReact ? [] : react()),
		replace({
			__DEV__: process.env.NODE_ENV !== 'production',
			preventAssignment: true
		})
	],
	resolve: {
		alias: useBigReact
			? {
					react: resolvePackage('react'),
					'react-dom': resolvePackage('react-dom'),
					'react-noop-renderer': resolvePackage('react-noop-renderer'),
					hostConfig:
						renderer === 'dom'
							? resolvePackage('react-dom/src/hostConfig.ts')
							: resolvePackage('react-noop-renderer/src/hostConfig.ts')
				}
			: []
	},
	optimizeDeps: {
		exclude: useBigReact
			? ['react', 'react-dom', 'react-noop-renderer', 'hostConfig']
			: []
	}
});
