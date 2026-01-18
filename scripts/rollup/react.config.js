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
				file: `${pkgDistPath}/index.js`,
				format: 'cjs'
			},
			{
				file: `${pkgDistPath}/index.esm.js`,
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
					main: 'index.js',
					module: 'index.esm.js',
					exports: {
						'.': {
							import: './index.esm.js',
							require: './index.js'
						},
						'./jsx-runtime': {
							import: './jsx-runtime.esm.js',
							require: './jsx-runtime.js'
						},
						'./jsx-dev-runtime': {
							import: './jsx-dev-runtime.esm.js',
							require: './jsx-dev-runtime.js'
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
				file: `${pkgDistPath}/jsx-runtime.js`,
				format: 'cjs'
			},
			// jsx-dev-runtime
			{
				file: `${pkgDistPath}/jsx-dev-runtime.js`,
				format: 'cjs'
			},
			// esm jsx-runtime
			{
				file: `${pkgDistPath}/jsx-runtime.esm.js`,
				format: 'es'
			},
			// esm jsx-dev-runtime
			{
				file: `${pkgDistPath}/jsx-dev-runtime.esm.js`,
				format: 'es'
			}
		],
		plugins: [...getBaseRollupPlugins()]
	}
];
