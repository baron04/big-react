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
				file: `${pkgDistPath}/index.js`,
				format: 'cjs'
			},
			{
				file: `${pkgDistPath}/index.esm.js`,
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
					peerDependencies: {
						react: version
					},
					main: 'index.js',
					module: 'index.esm.js',
					exports: {
						'.': {
							import: './index.esm.js',
							require: './index.js'
						},
						'./client': {
							import: './client.esm.js',
							require: './client.js'
						},
						'./test-utils': {
							import: './test-utils.esm.js',
							require: './test-utils.js'
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
				file: `${pkgDistPath}/client.js`,
				format: 'cjs'
			},
			{
				file: `${pkgDistPath}/client.esm.js`,
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
				file: `${pkgDistPath}/test-utils.js`,
				format: 'cjs'
			},
			{
				file: `${pkgDistPath}/test-utils.esm.js`,
				format: 'es'
			}
		],
		external: ['react-dom', 'react'],
		plugins: getBaseRollupPlugins()
	}
];
