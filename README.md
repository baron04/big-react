# 从0实现React18

> 卡颂视频课程
> https://appjiz2zqrn2142.pc.xiaoe-tech.com/p/t_pc/goods_pc_detail/goods_detail/p_638035c1e4b07b05581d25db
> https://github.com/BetaSu/big-react

## 代码优化

卡颂版本存在的问题和我的优化：

- react版本号同时存在 0.0.0 和 1.0.0的问题，改成统一用 1.0.0
- jsx() 方法的实现错误，第三个参数应该是 maybeKey，而不是 maybeChildren
- 打包目录 dist/node_modules 改成 dist，更简洁
- react hooks只支持命名导出的问题，实现同时支持默认导出和命名导出
- 不再允许从 react-dom 导入 createRoot，只能从 react-dom/client 导出，和 React18/19官方实现一致
- react-dom和 react-dom/client 是同一个入口打出来的“克隆文件”，改成两个独立的 bundle 配置
- 修复 react 和 shared 的循环引用问题，这个问题会导致 npm link 调试时，代码执行到 `packages/shared/internals.ts` React 是 undefined
- 去掉 UMD 模块规范的打包，统一使用 CJS+ESM 规范打包。不需要支持「直接 `<script>` 用 CDN + 全局变量」的场景。统一成 ESM + CJS 更简单、也更贴近当下主流生态，支持 vite ESM 规范
- 通过全部测试用例
- 增加了2个Suspense用例
- 最终版本代码 Suspense demo 不符合预期，不会从 fallback 切换 primary，已修复
  - 卡颂版本在「22-6 实现unwind流程」写的 attachPingListener 存在 bug

## 三种调试方式

### 1. 通过 npm 调试

#### 方法1 发布到 npm 仓库再安装调试

#### 方法2 通过 npm link 调试

如果调试项目是通过vite构建，建议启动项目命令 vite 后面增加 --force 参数，强制刷新缓存

- 在 /dist/react 目录下执行 `npm link`
- 在 /dist/react-dom 目录下执行 `npm link`
- 在调试项目目录下执行 `npm link react react-dom`

#### 方法3 通过安装本地文件依赖调试

package.json

```json
{
  "dependencies": {
    "react": "file:../big-react/dist/react",
    "react-dom": "file:../big-react/dist/react-dom"
  }
}
```

执行 npm install 安装依赖

### 2.通过 Monorepo 调试

推荐方案，代码更新不需要重新构建，支持热更新，最方便的调试方式

package.json

```json
{
  "dependencies": {
    "react": "workspace:*",
    "react-dom": "workspace:*"
  }
}
```

### 3. jest 单元测试

执行 `pnpm test` 命令
