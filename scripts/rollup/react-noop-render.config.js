import { getBaseRollupPlugins, getPackageJSON, resolvePkgPath } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';

const { name, module, peerDependencies } = getPackageJSON(
	'react-noop-renderer'
);
// react-noop-renderer 包路径
const pkgPath = resolvePkgPath(name);
// react-noop-renderer 产物路径
const pkgDistPath = resolvePkgPath(name, true);

export default [
	// react-noop-renderer
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
			...getBaseRollupPlugins({
				typescript: {
					tsconfigOverride: {
						exclude: ['./packages/react-dom/**/*'],
						compilerOptions: {
							paths: {
								hostConfig: [`./${name}/src/hostConfig.ts`]
							}
						}
					}
				}
			}),
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
						}
					}
				})
			})
		]
	}
];
