import { getBaseRollupPlugins, getPackageJSON, resolvePkgPath } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';

const { name, module } = getPackageJSON('react');
// react 包路径
const pkgPath = resolvePkgPath(name);
// react 产物路径
const pkgDistPath = resolvePkgPath(name, true);

export default [
	// react
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
		plugins: [
			...getBaseRollupPlugins(),
			generatePackageJson({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					type: 'module',
					main: 'index.cjs',
					module: 'index.js',
					exports: {
						'.': {
							import: './index.js',
							require: './index.cjs'
						},
						'./jsx-runtime': {
							import: './jsx-runtime.js',
							require: './jsx-runtime.cjs'
						},
						'./jsx-dev-runtime': {
							import: './jsx-dev-runtime.js',
							require: './jsx-dev-runtime.cjs'
						}
					}
				})
			})
		]
	},
	// jsx-runtime
	{
		input: `${pkgPath}/src/jsx.ts`,
		output: [
			// jsx-runtime
			{
				file: `${pkgDistPath}/jsx-runtime.cjs`,
				format: 'cjs'
			},
			// jsx-dev-runtime
			{
				file: `${pkgDistPath}/jsx-dev-runtime.cjs`,
				format: 'cjs'
			},
			// esm jsx-runtime
			{
				file: `${pkgDistPath}/jsx-runtime.js`,
				format: 'es'
			},
			// esm jsx-dev-runtime
			{
				file: `${pkgDistPath}/jsx-dev-runtime.js`,
				format: 'es'
			}
		],
		plugins: [...getBaseRollupPlugins()]
	}
];
