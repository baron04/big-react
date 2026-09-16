# 从0实现React18核心功能

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

- Fiber 架构和双缓存机制
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

### 与参考实现的差异

> 本项目基于卡颂[「从0实现React18」课程](https://appjiz2zqrn2142.pc.xiaoe-tech.com/p/t_pc/goods_pc_detail/goods_detail/p_638035c1e4b07b05581d25db)实现
> 参考源码: https://github.com/BetaSu/big-react

#### Bug 修复

- **连续 setState 结果错误**：`processUpdateQueue` 应基于 `newState` 而非 `baseState` 累积；`eagerState` 也只有队首 update 能直接复用
- **插入位置错误**：`insertOrAppendPlacementNodeIntoContainer` 递归子节点时未透传 `before`，FC/Fragment 包裹的节点被 append 到末尾
- **样式不生效**：`createInstance`/`commitUpdate` 只把 props 存进 `dom[elementPropsKey]`（原为 `// TODO 处理props`），`className`/`style` 从不写入 DOM
- **ref 复用后不更新**：diff 复用 fiber 时未把 `element.ref` 同步到复用的 fiber 上，ref 停留在旧值
- **Transition 优先级错误**：TransitionLane 映射成了 IdlePriority，React 18/19 中应为 NormalPriority
- **事件重复绑定**：监听注册在 `render()` 中，同一 root 多次 render 会重复绑定，改为 `createRoot` 时注册一次
- **Suspense 不恢复**：`attachPingListener` 有 bug（课程「22-6 实现unwind流程」），demo 不会从 fallback 切回 primary
- **更新找不到 root**：`markUpdateLaneFromFiberToRoot` 有 bug（课程「23-3 实现bailout策略(上)」），并补上返回 null 时的处理
- **bailout 克隆子树出错**：`cloneChildFiber` 的 sibling 应基于 `currentChild` 克隆，而不是上一个 `newChild`（课程「23-4 实现bailout策略(下)」）
- **bailout 后列表重排失效**：`createWorkInProgress` 未复制 `index`，残留 alternate 上的陈旧值，导致下次 diff 漏打 Placement
- 其余防御性修复：
  - `createElement` 的 config 空值检查
  - `startTransition` 没有 try/finally
  - `schedulerPriorityToLane` 补 Idle 映射
  - noop renderer 的 update 与节点移动处理

#### 工程与打包调整

- `React.version` 与 package.json 版本号不一致（参考实现运行时导出 `0.0.0`、package.json 为 `1.0.0`），统一为 1.0.0
- 打包产物目录由 dist/node_modules 改为 dist，更简洁
- hooks 同时支持默认导出和命名导出（参考实现只支持命名导出）
- 不再允许从 react-dom 导入 `createRoot`，只能从 react-dom/client 导入，和 React 18/19 官方实现一致
- react-dom 和 react-dom/client 由同一个入口打出的“克隆文件”改为两份独立的 bundle 配置
- 不再输出 UMD 产物，改为同时提供 CJS 和 ESM：本项目不支持通过普通 `<script>` 标签从 CDN 引入并访问全局变量的用法；ESM 供 Vite 等现代构建工具优先消费，CJS 用于兼容现有 Node.js 与仍使用 `require` 的工具链，因此无需再维护第三种 UMD 构建
- 修复 `react` → `react-reconciler` → `shared` 的循环引用：`currentDispatcher.ts` 对 `fiberHooks` 的类型导入改为 `import type` 以断开运行时依赖，`shared/internals.ts` 改用默认导入；否则 npm link 调试时执行到 `packages/shared/internals.ts` 拿到的 React 是 undefined

#### 测试

- 参考实现自带的测试用例跑不通，已修复（例如 `ReactEffectOrdering-test.js` 中移除了 `jest.useFakeTimers()`；`ReactElement-test.js` 的 immutable 断言改为如实描述"本实现不 freeze element"）
- 参考实现只有从官方 React 仓库搬来的 `ReactElement-test.js`、`ReactEffectOrdering-test.js` 两个测试文件；本项目补充了覆盖关键流程的用例：useState、useEffect、Context、bailout、reconciliation、useTransition、批处理、useMemo/useCallback、ref、Fragment、Suspense、优先级调度、合成事件等，完整用例见各包的 `src/__tests__/`

#### Demo

- 把 demo 改成 monorepo 的一个 package，有独立的 npm scripts。更方便切换不同 demo，不用改代码，也方便同时运行多个 demo
- 通过 JSX 类型声明，解决了编辑器内的 jsx 报错，不用安装 `@types/react`。安装了 `@types/react` 不方便在编辑器内从 demo 跳转到源码
- 支持切换官方 React 和自制 React，只需要修改 `vite.config.js` 中的配置，这样更方便对比测试官方 React 和自制 React 的表现

## 与 React 18 的差异（本实现基于 React 18）

以下为本实现与官方 React 18 的差异及未实现/未完善点，按模块归纳。

1. **Concurrent Features 支持不完整**
   - 实现了基础的并发渲染，但缺少一些高级特性
   - `useDeferredValue`、`useId` 等 Hooks 未实现

2. **事件系统**
   - 仅实现了 click（含捕获与冒泡、onClickCapture），官方 React 支持所有标准事件；其他 DOM 事件（input、change、keydown 等）及事件池、事件优先级（离散/连续/默认）未实现
   - 事件委托机制较为简单。实现上对 click 已做捕获与冒泡（`SyntheticEvent.ts` 中 `collectPaths` → `triggerEventFlow(capture)` 再 bubble）

3. **Suspense 与高级组件**
   - Suspense 已实现（配合 use/thenable），但缺少部分高级特性，见 [讲义第 22 章](./docs/lecture-notes/22.md)
   - `React.lazy` 未实现
   - `SuspenseList`、`StrictMode` 未实现

4. **Context 优化**
   - 实现了基础的 Context，但缺少性能优化（如 Context 选择器），大 Context 下所 有消费者都会更新，见 [讲义第 21 章](./docs/lecture-notes/21.md)

5. **错误处理与恢复**
   - 未实现错误边界，组件 throw 的普通 Error 未被捕获（`throwException` 仅处理 thenable/Suspense），见 [error-boundary-implementation.md](./docs/error-boundary-implementation.md)
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

10. **性能优化 API（startTransition / useDeferredValue）**
    - `startTransition` 已实现基础版本，未实现：`options` 参数（如 `name`）、异步回调保持 pending、回调异常处理、Transition 追踪、开发环境过度更新告警、顶层 `React.startTransition` 导出；「同步更新 + transition 同批」场景与 React 19 的 `isPending` 可能未完全对齐
    - `useDeferredValue` 未实现

11. **开发工具、SSR、特殊元素、更新机制**
    - 未实现 React DevTools、Profiler API；开发模式警告和提示、Hooks 调用检查（调用顺序/条件调用）、PropTypes、更友好的错误信息与官方有差距
    - 未实现 SSR（`renderToString`、`renderToStaticMarkup`、hydration）；Server Components（实验性）、Streaming SSR 未支持
    - SVG/MathML 支持不完整，自定义元素支持有限
    - 自动批处理（Auto Batching）实现不完整，部分边缘情况未覆盖

12. **实现质量与工程化**
    - 类型标注远不如官方严格：官方 React 用 Flow 做了完整的内部类型标注，本实现 `FiberNode.type`、`FiberNode.stateNode`、部分 `hostConfig` 仍为 `any`，边界情况类型检查不足；HostRoot 的 updateQueue 也未在类型上明确 State（`createContainer` 用无泛型的 `createUpdateQueue()`，在 `updateContainer` 中 cast）
    - 测试覆盖有限：官方 React 有覆盖各渲染器、并发场景与回归用例的大型测试套件，本实现只覆盖关键流程
    - 未接入 CI/CD 与性能基准：官方有完整的持续集成和 benchmark，本实现两者都没有
    - 构建产物较简：未输出 Source Map，未做 bundle 体积分析；也没有 TypeScript 类型声明（官方 react 包本身同样不带 `.d.ts`，但有 DefinitelyTyped 的 `@types/react` 兜底，本实现没有对应方案）
    - 关键算法（workLoop、reconcile、processUpdateQueue 等）注释较少，对导出 API 也没有 JSDoc

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

测试通过 `dist/` 解析本项目的 `react`、`react-dom` 与 `react-noop-renderer`，因此需要先构建再测试。

- 执行 `pnpm test`：先 `build:prod`，再运行 Jest（推荐）
- 执行 `pnpm test:dist`：只测试当前已有的 `dist/` 产物，适合已经确认 dist 新鲜时快速调试

## 总结

本项目是一个优秀的 React 学习项目，实现了 React 18 的核心架构和主要功能。虽然与官方 React 相比还有一些功能缺失，但已经涵盖了 React 的核心概念和实现原理，非常适合用于：

- 深入理解 React 内部工作原理
- 学习 Fiber 架构和协调算法
- 理解 Hooks 系统的实现
- 学习优先级调度机制
- 理解并发渲染的实现

对于想要深入理解 React 源码的开发者来说，这是一个非常有价值的学习资源。

更多实现说明见 [docs](./docs/) 目录，如：

- [lecture-notes](./docs/lecture-notes/)：按课程顺序讲解 big-react 的代码设计思路，覆盖实现、差距对比与思考题
- [error-boundary-implementation.md](./docs/error-boundary-implementation.md)：错误边界设计
- [large-list-optimization.md](./docs/large-list-optimization.md)：大列表性能优化
- [react-source-interview-questions.md](./docs/react-source-interview-questions.md)：React 源码面试速成题库
