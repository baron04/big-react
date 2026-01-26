# 从0实现React18核心功能

> 基于卡颂视频课程实现
> 课程地址: https://appjiz2zqrn2142.pc.xiaoe-tech.com/p/t_pc/goods_pc_detail/goods_detail/p_638035c1e4b07b05581d25db
> 参考源码: https://github.com/BetaSu/big-react

## 项目概述

这是一个从零实现的 React 18 核心功能的教学项目，旨在帮助开发者深入理解 React 的内部工作原理。项目实现了 React 的核心架构，包括 JSX 转换、Fiber 架构、协调器（Reconciler）、调度器（Scheduler）、Hooks 系统等关键模块。

## 代码设计总结

### 架构设计

项目采用模块化设计，主要包含以下核心包：

1. **react** - React 核心 API，包括 JSX 转换、Hooks、Context 等
2. **react-reconciler** - 协调器实现，负责 Fiber 树的构建和更新
3. **react-dom** - DOM 宿主环境适配器
4. **react-noop-renderer** - 用于测试的 noop 渲染器
5. **shared** - 共享工具和类型定义

### 核心流程

1. **JSX 转换阶段**：将 JSX 语法转换为 `ReactElement` 对象
2. **调度阶段**：根据优先级调度更新任务
3. **Render 阶段**：构建/更新 Fiber 树，执行 diff 算法
4. **Commit 阶段**：将 Fiber 树的变更应用到 DOM

### 关键数据结构

- **ReactElement**: JSX 转换后的数据结构
- **FiberNode**: 虚拟 DOM 节点，包含节点信息、副作用标记、优先级等
- **FiberRootNode**: Fiber 树的根节点，管理整个应用的更新流程
- **UpdateQueue**: 更新队列，管理状态更新

### 优先级系统

实现了基于 Lane 模型的优先级系统：
- `SyncLane` (0b00001) - 同步优先级
- `InputContinuousLane` (0b00010) - 输入连续优先级
- `DefaultLane` (0b00100) - 默认优先级
- `TransitionLane` (0b01000) - 过渡优先级
- `IdleLane` (0b10000) - 空闲优先级

## 代码优化记录

卡颂版本存在的问题和已修复的优化：

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
  - 卡颂版本在「23-3 实现bailout策略(上)」写的 markUpdateLaneFromFiberToRoot 存在 bug

### cursor Review 修复的问题

1. **createElement 中 config 为 undefined 的处理**：添加了 null/undefined 检查，避免遍历 undefined 对象
2. **processUpdateQueue 状态计算错误**：修复了在计算新状态时应该使用 `newState` 而不是 `baseState` 的问题
3. **markUpdateLaneFromFiberToRoot 返回值处理**：添加了 null 检查，避免在找不到 FiberRootNode 时继续执行导致错误

## 设计不合理的地方

### 1. 错误处理不完善

- `markUpdateLaneFromFiberToRoot` 返回 null 时，调用者没有统一处理机制
- 缺少全局错误边界（Error Boundary）的实现
- Suspense 异常处理机制较为简单，缺少完整的错误恢复流程

### 2. 性能优化不足

- 缺少对大型列表的优化（如虚拟滚动）
- bailout 策略的实现相对简单，可以进一步优化

### 3. 类型安全

- 部分地方使用了 `any` 类型，类型定义不够严格
- 缺少对边界情况的类型检查

### 4. 代码组织

- 部分 TODO 注释标记的功能未实现
- 缺少完整的单元测试覆盖

### 5. 功能完整性

- 只实现了 click 事件，其他事件类型未实现
- 缺少对 SVG、MathML 等特殊元素的支持
- 缺少对 Portal 的支持
- 缺少对 Concurrent Features 的完整实现（如 useDeferredValue、useId 等）

## 与官方 React 19 的区别

### React 19 新增特性（本实现未包含）

1. **React Compiler**
   - React 19 引入了自动优化编译器，无需手动使用 memo/useMemo
   - 本实现需要手动使用 memo/useMemo 进行优化

2. **Server Components**
   - React 19 完全支持服务端组件
   - 本实现仅支持客户端渲染

3. **Actions 和 Form 处理**
   - React 19 新增 `useActionState`、`useFormStatus`、`useOptimistic` 等 Hooks
   - 本实现未包含这些 Hooks

4. **新的 Hooks**
   - `useActionState` - 处理表单提交和异步操作
   - `useFormStatus` - 获取表单状态
   - `useOptimistic` - 乐观更新
   - `use` - 本实现已包含基础版本，但功能较简单

5. **改进的 Hydration**
   - React 19 支持部分 hydration 和更好的 hydration 错误处理
   - 本实现未实现 SSR/hydration

6. **ref 作为 prop**
   - React 19 允许 ref 作为普通 prop 传递
   - 本实现仍使用传统的 ref 处理方式

### 与 React 18 的差异（本实现基于 React 18）

1. **Concurrent Features 支持不完整**
   - 实现了基础的并发渲染，但缺少一些高级特性
   - `useDeferredValue`、`useId` 等 Hooks 未实现

2. **事件系统简化**
   - 只实现了 click 事件，官方 React 支持所有标准事件
   - 事件委托机制较为简单

3. **Suspense 功能**
   - 实现了基础的 Suspense，但缺少一些高级特性（如 SuspenseList）

4. **Context 优化**
   - 实现了基础的 Context，但缺少性能优化（如 Context 选择器）

## 未实现的功能

### 核心功能

1. **类组件支持**
   - 未实现 Class Component
   - 未实现生命周期方法
   - 未实现 `getSnapshotBeforeUpdate`、`componentDidCatch` 等

2. **错误边界（Error Boundary）**
   - 未实现 `componentDidCatch` 和 `getDerivedStateFromError`
   - 未实现错误边界机制

3. **Portal**
   - 未实现 `ReactDOM.createPortal`

4. **Refs 高级功能**
   - 未实现 `forwardRef`
   - 未实现 ref 回调的完整生命周期

5. **更多 Hooks**
   - `useReducer` - 未实现
   - `useLayoutEffect` - 未实现（只有 useEffect）
   - `useImperativeHandle` - 未实现
   - `useDeferredValue` - 未实现
   - `useId` - 未实现
   - `useSyncExternalStore` - 未实现

6. **高级组件**
   - `lazy` 和 `Suspense` 配合 - 部分实现，但不完整
   - `SuspenseList` - 未实现
   - `StrictMode` - 未实现

7. **事件系统**
   - 只实现了 click 事件
   - 未实现其他 DOM 事件（如 input、change、keydown 等）
   - 未实现合成事件的完整特性

8. **性能优化 API**
   - `startTransition` - 已实现基础版本
   - `useDeferredValue` - 未实现
   - `useMemo` 和 `useCallback` - 已实现

9. **开发工具支持**
   - 未实现 React DevTools 支持
   - 未实现 Profiler API

10. **服务端渲染（SSR）**
    - 未实现 `renderToString`
    - 未实现 `renderToStaticMarkup`
    - 未实现 hydration

11. **特殊元素支持**
    - SVG 元素支持不完整
    - MathML 未支持
    - 自定义元素支持有限

12. **更新机制**
    - 自动批处理（Auto Batching）实现不完整
    - 缺少对某些边缘情况的处理

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

### 2. 通过 Monorepo 调试

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

## 总结

本项目是一个优秀的 React 学习项目，实现了 React 18 的核心架构和主要功能。虽然与官方 React 相比还有一些功能缺失，但已经涵盖了 React 的核心概念和实现原理，非常适合用于：

- 深入理解 React 内部工作原理
- 学习 Fiber 架构和协调算法
- 理解 Hooks 系统的实现
- 学习优先级调度机制
- 理解并发渲染的实现

对于想要深入理解 React 源码的开发者来说，这是一个非常有价值的学习资源。
