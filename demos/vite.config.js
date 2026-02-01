import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import replace from '@rollup/plugin-replace';
import path from 'path';

// 使用自制 React 实现；false 时使用官方 React
const useCustomReact = true;
// 是否使用 noop renderer；false 时使用 DOM renderer
const useNoopRenderer = false;

function resolvePackage(pkgName) {
	return path.resolve(__dirname, '../packages', pkgName);
}

// https://vitejs.dev/config/
export default defineConfig({
	root: __dirname,
	plugins: [
		...(useCustomReact ? [] : react()),
		replace({
			__DEV__: process.env.NODE_ENV !== 'production',
			preventAssignment: true
		})
	],
	resolve: {
		alias: useCustomReact
			? {
					react: resolvePackage('react'),
					'react-dom': resolvePackage('react-dom'),
					'react-noop-renderer': resolvePackage('react-noop-renderer'),
					hostConfig: useNoopRenderer
						? resolvePackage('react-noop-renderer/src/hostConfig.ts')
						: resolvePackage('react-dom/src/hostConfig.ts')
				}
			: []
	},
	optimizeDeps: {
		exclude: useCustomReact
			? ['react', 'react-dom', 'react-noop-renderer', 'hostConfig']
			: []
	}
});
