# 从0实现React18核心功能

> 基于卡颂视频课程实现
> 课程地址: https://appjiz2zqrn2142.pc.xiaoe-tech.com/p/t_pc/goods_pc_detail/goods_detail/p_638035c1e4b07b05581d25db
> 参考源码: https://github.com/BetaSu/big-react

## 项目概述

这是一个从零实现的 React 18 核心功能的教学项目，旨在帮助开发者深入理解 React 的内部工作原理。项目实现了 React 的核心架构，包括：JSX 转换、Fiber 架构、协调器（Reconciler）、调度器（Scheduler）、Hooks 系统等关键模块。支持 Sync 与 Concurrent 两种渲染路径（SyncLane 微任务同步执行，非 SyncLane 经 Scheduler 可中断执行）

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
2. **调度阶段**：根据优先级调度更新任务（SyncLane 微任务同步执行，非 SyncLane 经 Scheduler 可中断执行）
3. **Render 阶段**：构建/更新 Fiber 树，执行 diff 算法
4. **Commit 阶段**：将 Fiber 树的变更应用到 DOM

### 关键数据结构

- **ReactElement**: JSX 转换后的数据结构
- **FiberNode**: 虚拟 DOM 节点，包含节点信息、副作用标记、优先级等
- **FiberRootNode**: Fiber 树的根节点，管理整个应用的更新流程
- **UpdateQueue**: 更新队列，管理状态更新

### 已实现功能

- Fiber 架构和双缓冲机制
- JSX 转换和 ReactElement 创建
- 函数组件渲染
- useState、useEffect、useContext、useRef、useMemo、useCallback、useTransition 等 Hooks
- 基础事件系统（click 的捕获与冒泡、onClickCapture）
- DOM 操作（创建、更新、删除）
- 子节点 Reconciliation（Diff 算法）
- UpdateQueue 环形链表与 Flags 标记系统
- Context API 基础实现
- Suspense 基础实现（配合 use/thenable）
- Fragment、bailout 优化、React.memo
- 基于 Lane 的优先级调度与 startTransition

### 代码优化记录

卡颂版本存在的问题和已修复的优化：

- react版本号同时存在 0.0.0 和 1.0.0 的问题，改成统一用 1.0.0
- jsx() 方法的实现错误，第三个参数应该是 maybeKey，而不是 maybeChildren
- 打包目录 dist/node_modules 改成 dist，更简洁
- react hooks只支持命名导出的问题，实现同时支持默认导出和命名导出
- 不再允许从 react-dom 导入 createRoot，只能从 react-dom/client 导出，和 React18/19官方实现一致
- react-dom和 react-dom/client 是同一个入口打出来的“克隆文件”，改成两个独立的 bundle 配置
- 修复 react 和 shared 的循环引用问题，这个问题会导致 npm link 调试时，代码执行到 `packages/shared/internals.ts` React 是 undefined
- 去掉 UMD 模块规范的打包，统一使用 CJS+ESM 规范打包。不需要支持「直接 `<script>` 用 CDN + 全局变量」的场景。统一成 ESM + CJS 更简单、也更贴近当下主流生态，支持 vite ESM 规范
- 已有测试用例全部通过
- 补充单元测试，覆盖关键流程
- 最终版本代码 Suspense demo 不符合预期，不会从 fallback 切换 primary，已修复
  - 卡颂版本在「22-6 实现unwind流程」写的 attachPingListener 存在 bug
  - 卡颂版本在「23-3 实现bailout策略(上)」写的 markUpdateLaneFromFiberToRoot 存在 bug

### AI 修复的问题

- 1. **createElement 中 config 为 undefined 的处理**：添加了 null/undefined 检查，避免遍历 undefined 对象
- 2. **processUpdateQueue 状态计算错误**：修复了在计算新状态时应该使用 `newState` 而不是 `baseState` 的问题
  - [验证-updateQueue-修改](./docs/validate-updateQueue-modify.md)
- 3. **markUpdateLaneFromFiberToRoot 返回值处理**：添加了 null 检查，避免在找不到 FiberRootNode 时继续执行导致错误
- 4. TransitionLane 错误地映射为 IdlePriority

```
在 React 18/19 源码中，TransitionLane 会映射为 NormalPriority，而不是 IdlePriority。
转换步骤：
TransitionLane     →     DefaultEventPriority     →     NormalSchedulerPriority
                   ↑                              ↑
         lanesToEventPriority()   eventPriorityToSchedulerPriority()
```

## 与 React 18 的差异（本实现基于 React 18）

以下为本实现与官方 React 18 的差异及未实现/未完善点，按模块归纳。

1. **Concurrent Features 支持不完整**
   - 实现了基础的并发渲染，但缺少一些高级特性
   - `useDeferredValue`、`useId` 等 Hooks 未实现

2. **事件系统**
   - 仅实现了 click（含捕获与冒泡、onClickCapture），官方 React 支持所有标准事件；其他 DOM 事件（input、change、keydown 等）及事件池、事件优先级（离散/连续/默认）未实现
   - 事件委托机制较为简单。实现上对 click 已做捕获与冒泡（`SyntheticEvent.ts` 中 `collectPaths` → `triggerEventFlow(capture)` 再 bubble）

3. **Suspense 与高级组件**
   - Suspense 已实现（配合 use/thenable），但缺少部分高级特性，见 [suspense-implementation.md](./docs/suspense-implementation.md)
   - `React.lazy` 未实现
   - `SuspenseList`、`StrictMode` 未实现

4. **Context 优化**
   - 实现了基础的 Context，但缺少性能优化（如 Context 选择器），大 Context 下所有消费者都会更新，见 [context-implementation.md](./docs/context-implementation.md)

5. **错误处理与恢复**
   - 未实现错误边界，组件 throw 的普通 Error 未被捕获（`throwException` 仅处理 thenable/Suspense），见 [error-boundary-implementation.md](./docs/error-boundary-implementation.md)
   - `markUpdateLaneFromFiberToRoot` 返回 null 时，调用方无统一处理机制
   - Suspense 异常恢复较简单，缺少完整错误恢复流程

6. **类组件与错误边界**
   - 未实现 Class Component、生命周期方法、`getSnapshotBeforeUpdate`、`componentDidCatch`、`getDerivedStateFromError` 及错误边界机制

7. **Portal 与 Refs**
   - 未实现 `createPortal`（react-dom，常用于弹层、模态框挂载到 body）
   - 未实现 `forwardRef`、ref 回调的完整生命周期

8. **更多 Hooks**
   - 未实现：`useReducer`、`useLayoutEffect`、`useImperativeHandle`、`useDeferredValue`、`useId`、`useSyncExternalStore`

9. **性能优化与大型列表**
   - 缺少大型列表优化（如 useDeferredValue、Diff 优化），见 [large-list-optimization.md](./docs/large-list-optimization.md)；bailout 策略较简单
   - 未实现 Fiber 节点复用池，未内置虚拟滚动
   - 类型上 `any` 使用较多，边界情况类型检查不足

10. **性能优化 API（startTransition / useDeferredValue）**
    - `startTransition` 已实现基础版本，未实现：`options` 参数（如 `name`）、异步回调保持 pending、回调异常处理、Transition 追踪、开发环境过度更新告警、顶层 `React.startTransition` 导出；「同步更新 + transition 同批」场景与 React 19 的 `isPending` 可能未完全对齐
    - `useDeferredValue` 未实现

11. **开发工具、SSR、特殊元素、更新机制**
    - 未实现 React DevTools、Profiler API；开发模式警告和提示、Hooks 调用检查（调用顺序/条件调用）、PropTypes、更友好的错误信息与官方有差距
    - 未实现 SSR（`renderToString`、`renderToStaticMarkup`、hydration）；Server Components（实验性）、Streaming SSR 未支持
    - SVG/MathML 支持不完整，自定义元素支持有限
    - 自动批处理（Auto Batching）实现不完整，部分边缘情况未覆盖

12. **实现质量与工程化**
    - `markUpdateLaneFromFiberToRoot` 返回 null 时，调用者没有统一处理机制
    - 部分 TODO 注释标记的功能未实现；单元测试覆盖不完整（已有关键流程用例：useState、useEffect、Context、bailout、reconciliation、useTransition、批处理、useMemo/useCallback、ref、Fragment 等）
    - `FiberNode.type`/`stateNode` 为 `any`（`fiber.ts`），可收窄；HostRoot 的 `updateQueue` 类型可在一处统一；构建与库模式、bundle 分析等未在 README 展开

13. **调度器与 Reconciliation 实现细节**
    - 调度器：SyncLane 通过微任务 + `performSyncWorkOnRoot` 同步执行；非 SyncLane 已使用 `scheduler` 包与 `performConcurrentWorkOnRoot`，支持时间切片（`unstable_shouldYield`）与可中断渲染。边缘逻辑：高优先级打断低优先级可能未完全覆盖；调度入口未使用 `requestIdleCallback`/`MessageChannel`（本项目用 `scheduleMicroTask` + Scheduler）
    - Reconciliation：`reconcileChildrenArray` 已用 Map 预建 key 索引，单端 Diff + Map 复用的主流程与官方一致；memo 的 compare 使用 `shallowEqual`，与官方行为可进一步对齐
    - Hooks：`dispatchSetState` 每次 render 时 `bind(null, fiber, queue)`（`fiberHooks.ts`），dispatch 引用不稳定；开发模式未做 Hooks 规则检查（调用顺序、条件调用等）

14. **调度行为**
    - DefaultLane 和 TransitionLane 最终都映射到 NormalPriority，但它们在 React 内部的行为有本质区别。DefaultLane（如 `setTimeout` 内 setState）一旦被调度并执行，预期不会被用户交互打断（click），仅 TransitionLane 可被高优打断。本实现 DefaultLane 会被用户交互打断。

15. **DOM 属性（hostConfig）**
    - 本实现仅做**简化**：`createInstance` / `commitUpdate` 中只把 `className` 和 `style`（对象）应用到 DOM 节点，其余 props（如 `id`、`htmlFor`、`tabIndex`、`dangerouslySetInnerHTML` 等）未写入 DOM，仅保存在 `dom[elementPropsKey]` 供事件委托等使用。与官方 React 的完整 DOM 属性同步行为有差异；如需完整属性支持可在 `packages/react-dom/src/hostConfig.ts` 的 `applyPropsToDOM` 中扩展。

## 与 React 19 的区别（React 19 新增特性，本实现未包含）

1. **React Compiler**
   - React 19 引入了自动优化编译器，无需手动使用 memo/useMemo
   - 本实现需要手动使用 memo/useMemo 进行优化

2. **Server Components**
   - React 19 完全支持服务端组件
   - 本实现仅支持客户端渲染

3. **React 19 新增的 Hooks**
   - `useActionState` - 处理表单提交和异步操作，本实现未包含
   - `useFormStatus` - 获取表单状态，本实现未包含
   - `useOptimistic` - 乐观更新，本实现未包含
   - `use` - React 19 正式发布，本实现已提供简化版（见 Suspense 相关章节）

4. **改进的 Hydration**
   - React 19 支持部分 hydration 和更好的 hydration 错误处理
   - 本实现未实现 SSR/hydration

5. **ref 作为 prop**
   - React 19 允许 ref 作为普通 prop 传递
   - 本实现仍使用传统的 ref 处理方式

## 优化项（TODOs）

以下为本项目的改进建议与待办，按类别归纳，便于后续迭代。

### 测试

- 补充单元测试与集成测试，测试覆盖率目标 80%+（当前已有关键流程用例：useState、useEffect、Context、bailout、reconciliation、useTransition、批处理、useMemo/useCallback、ref、Fragment 等）

### 代码质量

- 减少 `any` 使用，完善 TypeScript 类型定义
- 为关键算法添加详细注释（如 workLoop、reconcile、processUpdateQueue 等流程）；对导出 API 可酌情添加 JSDoc（非必须）
- 添加性能基准测试
- 添加 CI/CD 配置

### 类型收窄

- `FiberNode.type`、`FiberNode.stateNode`、部分 `hostConfig` 的 `any` 可逐步改为 `WorkTag`、`Instance | null`、`Props` 等，便于后续扩展（如 Fragment、Lazy）且不增加运行时复杂度
- HostRoot 的 updateQueue：在类型上明确 State 为 `ReactElement | null`，与 `updateContainer` 中 `createUpdate` 的泛型一致，避免后续扩展时类型错位（当前 `createContainer` 中为无泛型 `createUpdateQueue()`，在 `updateContainer` 中 cast）

### 构建与打包

当前已有

- 库模式打包
- ESM/CJS 双格式
- package.json `exports` 与 react-dom 的 `peerDependencies`
- `__DEV__` 通过 replace 注入（见 `scripts/rollup/utils.js`）

未做或可加强

- TypeScript 类型声明（.d.ts 未输出到 dist）
- 生产环境代码压缩（未接入 terser 等）
- Source Map
- bundle 大小分析
- 发布流程与版本管理
- CDN 支持

### 文档

- API 文档
- 架构设计文档
- Fiber / Reconciliation / Hooks 实现原理详解
- 代码示例与最佳实践

## 三种调试方式

### 1. 通过 npm 调试

需先执行 `pnpm build:dev` 或 `pnpm build:prod` 生成 dist 目录后再进行以下操作。

#### 1.1 发布到 npm 仓库再安装调试

先执行 `pnpm build:prod` 打包，将 dist 下的 react、react-dom 发布到 npm 后，在其他项目中 `npm install` 安装使用。

#### 1.2 通过 npm link 调试

如果调试项目是通过 vite 构建，建议启动时加 `--force` 参数强制刷新缓存。

- 在项目根目录执行 `pnpm build:dev` 或 `pnpm build:prod`
- 在 `dist/react` 下执行 `npm link`，在 `dist/react-dom` 下执行 `npm link`
- 在调试项目目录下执行 `npm link react react-dom`

#### 1.3 通过安装本地文件依赖调试

package.json

```json
{
	"dependencies": {
		"react": "file:../big-react/dist/react",
		"react-dom": "file:../big-react/dist/react-dom"
	}
}
```

在调试项目目录下执行 `npm install` 安装依赖

### 2. 通过 Monorepo 调试（推荐）

使用 `workspace:*` 依赖时，可直接引用源码，代码更新无需重新构建，支持热更新，是最方便的调试方式。

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

更多实现说明见 [docs](./docs/) 目录，如：

- [context-implementation.md](./docs/context-implementation.md)
- [suspense-implementation.md](./docs/suspense-implementation.md)
- [useTransition-implementation.md](./docs/useTransition-implementation.md)
