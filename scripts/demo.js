// TODO: 存在热更新问题没有解决
import prompts from 'prompts';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目路径列表
const projects = [
	'test-fc',
	'context',
	'performance',
	'ref',
	'suspense-use',
	'transition'
];

(async () => {
	try {
		// 通过 prompts 提供交互式选择
		const { selectedProject } = await prompts([
			{
				type: 'select',
				name: 'selectedProject',
				message: '请选择要启动的项目:',
				choices: projects.map((project) => ({ title: project, value: project }))
			}
		]);

		if (!selectedProject) {
			console.log('未选择任何项目，操作已取消。');
			return;
		}

		// 构建 Vite 配置路径和项目路径
		const viteConfigPath = path.join(__dirname, 'vite', 'vite.config.js');
		const projectPath = path.join(__dirname, '..', 'demos', selectedProject);

		console.log(`\n正在启动项目: ${selectedProject}...\n`);

		// 使用 spawn 替代 exec 以更好地支持热更新和实时输出
		const viteProcess = spawn(
			'pnpm',
			[
				'exec',
				'vite',
				'serve',
				projectPath,
				'--config',
				viteConfigPath,
				'--force'
			],
			{
				stdio: 'inherit', // 直接继承父进程的 stdio，确保热更新日志实时显示
				cwd: path.join(__dirname, '..') // 设置正确的工作目录
			}
		);

		// 处理进程退出
		viteProcess.on('close', (code) => {
			if (code !== 0) {
				console.error(`\nVite 进程退出，退出码: ${code}`);
			} else {
				console.log('\nVite 服务器已关闭');
			}
		});

		// 处理进程错误
		viteProcess.on('error', (error) => {
			console.error('启动 Vite 服务器时发生错误:', error);
		});

		// 优雅处理退出信号
		process.on('SIGINT', () => {
			console.log('\n正在关闭 Vite 服务器...');
			viteProcess.kill('SIGINT');
		});

		process.on('SIGTERM', () => {
			console.log('\n正在关闭 Vite 服务器...');
			viteProcess.kill('SIGTERM');
		});
	} catch (error) {
		console.error('发生错误:', error);
	}
})();
