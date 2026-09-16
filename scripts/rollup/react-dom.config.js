import { getBaseRollupPlugins, getPackageJSON, resolvePkgPath } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';

const { name, module, peerDependencies } = getPackageJSON('react-dom');
// react-dom 包路径
const pkgPath = resolvePkgPath(name);
// react-dom 产物路径
const pkgDistPath = resolvePkgPath(name, true);

export default [
	// react-dom
	{
		input: `${pkgPath}/${module}`,
		output: [
			{
				file: `${pkgDistPath}/index.cjs`,
				format: 'cjs'
			},
			{
				file: `${pkgDistPath}/index.js`,
				format: 'es'
			}
		],
		external: [...Object.keys(peerDependencies)],
		plugins: [
			...getBaseRollupPlugins(),
			// webpack resolve alias
			alias({
				entries: {
					hostConfig: `${pkgPath}/src/hostConfig.ts`
				}
			}),
			generatePackageJson({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					type: 'module',
					peerDependencies: {
						react: version
					},
					main: 'index.cjs',
					module: 'index.js',
					exports: {
						'.': {
							import: './index.js',
							require: './index.cjs'
						},
						'./client': {
							import: './client.js',
							require: './client.cjs'
						},
						'./test-utils': {
							import: './test-utils.js',
							require: './test-utils.cjs'
						}
					}
				})
			})
		]
	},
	// react-dom/client
	{
		input: `${pkgPath}/client.ts`,
		output: [
			{
				file: `${pkgDistPath}/client.cjs`,
				format: 'cjs'
			},
			{
				file: `${pkgDistPath}/client.js`,
				format: 'es'
			}
		],
		external: [...Object.keys(peerDependencies)],
		plugins: [
			...getBaseRollupPlugins(),
			// webpack resolve alias
			alias({
				entries: {
					hostConfig: `${pkgPath}/src/hostConfig.ts`
				}
			})
		]
	},
	// react-test-utils
	{
		input: `${pkgPath}/test-utils.ts`,
		output: [
			{
				file: `${pkgDistPath}/test-utils.cjs`,
				format: 'cjs'
			},
			{
				file: `${pkgDistPath}/test-utils.js`,
				format: 'es'
			}
		],
		external: ['react-dom', 'react'],
		plugins: getBaseRollupPlugins()
	}
];
