import prompts from 'prompts';
import path from 'path';
import { createServer } from 'vite';
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

    // 构建 Vite 配置路径
    const viteConfigPath = path.join(__dirname, 'vite', 'vite.config.js');

    console.log(`\n正在启动项目: ${selectedProject}...\n`);

    // 启动 Vite 开发服务器
    const server = await createServer({
      configFile: viteConfigPath,
      root: path.join(__dirname, '..', 'demos', selectedProject),
      server: { force: true }
    });

    await server.listen();

    console.log(`项目 ${selectedProject} 已启动，访问地址: ${server.resolvedUrls.local[0]}`);
  } catch (error) {
    console.error('发生错误:', error);
  }
})();
