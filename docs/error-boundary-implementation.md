# Error Boundary 实现详细设计

本文档描述在本项目中实现 **Error Boundary** 的完整代码设计思路：从异常抛出、边界查找、unwind 停靠、类组件渲染错误 UI 到 commit 阶段调用 `componentDidCatch`，以及与本项目现有 Suspense/throw 流程的衔接。

---

## 一、概述与 React API

### 1.1 什么是 Error Boundary

- **作用**：捕获子组件树在渲染、生命周期或构造函数中抛出的 JavaScript 错误，避免整个应用白屏；在捕获到错误后渲染备用 UI（如错误提示、重试按钮），并可通过 `componentDidCatch` 上报或恢复。
- **限制**：仅能捕获子树的同步/异步错误，不捕获事件处理器、setTimeout、服务端渲染、自身 throw 的错误。
- **实现形式**：React 官方仅支持**类组件**作为 Error Boundary，通过静态方法 `getDerivedStateFromError` 和实例方法 `componentDidCatch` 声明。

### 1.2 React API 约定

| API                                     | 说明                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **getDerivedStateFromError(error)**     | 静态方法，在子组件抛出错误后、渲染 fallback 前调用；返回值（对象）会与当前 state 合并，常用于设置 `state: { hasError: true, error }`。 |
| **componentDidCatch(error, errorInfo)** | 实例方法，在 commit 阶段（DOM 已更新）调用；`errorInfo` 包含 `componentStack`（组件栈字符串），常用于日志上报。                        |

典型用法：

```jsx
class ErrorBoundary extends React.Component {
	state = { hasError: false, error: null };

	static getDerivedStateFromError(error) {
		return { hasError: true, error };
	}

	componentDidCatch(error, errorInfo) {
		console.error(error, errorInfo.componentStack);
	}

	render() {
		if (this.state.hasError) return this.props.fallback;
		return this.props.children;
	}
}
```

### 1.3 本项目当前状态

- **workTags**：无 `ClassComponent`，仅有 FunctionComponent、HostRoot、HostComponent、HostText、Fragment、ContextProvider、SuspenseComponent、OffscreenComponent、MemoComponent。
- **throwException**（fiberThrow.ts）：仅处理 thenable（Suspense），有注释 `// Error Boundary` 但未实现 Error 分支；组件 throw 的普通 Error 未被分支处理。
- **unwindWork**（fiberUnwindWork.ts）：仅对 SuspenseComponent、ContextProvider 做 pop 或 DidCapture 停靠，无「在 Error Boundary 类组件上停靠」的逻辑。
- **beginWork / completeWork / commitWork**：无 ClassComponent 分支，无 `getDerivedStateFromError` / `componentDidCatch` 调用。

因此实现 Error Boundary 需要：**新增 ClassComponent 支持**（workTag、fiber 创建、beginWork/completeWork/commitWork）+ **在 throwException/unwindWork 中接入错误分支与边界停靠**。

---

## 二、完整流程架构

### 2.1 错误传播与边界捕获流程

```
组件 throw(error)
  ↓
workLoop 中 try/catch → handleThrow(root, thrownValue) → wipThrownValue = thrownValue
  ↓
throwAndUnwindWorkLoop(root, unitOfWork, thrownValue, lane)
  ├── resetHooksOnUnwind()
  ├── throwException(root, thrownValue, lane)   // 区分 thenable / Error
  │   ├── thenable → 现有 Suspense 逻辑（getSuspenseHandler、attachPingListener）
  │   └── Error    → findErrorBoundary(workInProgress)
  │                  ├── 找到 → 设 pendingError、flags |= ShouldCapture、scheduleUpdateOnFiber(errorBoundary, lane)
  │                  └── 未找到 → handleUncaughtError(root, error)
  └── unwindUnitOfWork(unitOfWork)
        ↓
      unwindWork 自下而上：遇 ClassComponent 且 flags & ShouldCapture 且未 DidCapture
        → flags = (flags & ~ShouldCapture) | DidCapture，return wip（停在该 fiber）
  ↓
下一轮调度：errorBoundary 被 scheduleUpdateOnFiber，beginWork 从该 fiber 开始
  ↓
updateClassComponent：若有 pendingError / DidCapture，调用 getDerivedStateFromError 合并 state，再 instance.render() → 渲染 fallback
  ↓
completeWork / commit 阶段：对 DidCapture 的 ClassComponent 调用 instance.componentDidCatch(error, errorInfo)，并清除 DidCapture / pendingError
```

### 2.2 与 Suspense / Promise reject 的衔接

- **thenable reject**：在 `attachPingListener` 的 onReject 中可调用统一入口 `handleSuspenseReject(root, error, lane, suspenseBoundary)`，其内同样 `findErrorBoundary(suspenseBoundary ?? workInProgress)`，找到则设 ShouldCapture + pendingError + scheduleUpdateOnFiber，与「组件 throw Error」路径一致；未找到则 handleUncaughtError 或向父级 Suspense 传播（见 suspense-implementation 文档第五节）。
- 本文档以「组件 throw Error」为主线；Promise reject 仅需在 attachPingListener 中把 onReject 接到上述统一入口即可。

---

## 三、各模块详细设计

### 3.1 workTags：新增 ClassComponent

**设计**

- 与 FunctionComponent 区分：函数组件 `typeof type === 'function'` 且无 `type.prototype.isReactComponent`；类组件为 `typeof type === 'function'` 且 `type.prototype && type.prototype.isReactComponent === true`（React 官方约定）。
- 在 workTags 中增加 `ClassComponent` 常量，并加入 `WorkTag` 联合类型。

**实现要点**

```typescript
// packages/react-reconciler/src/workTags.ts

export const ClassComponent = 2; // 与 React 内部数值对齐可选

export type WorkTag =
	| typeof FunctionComponent
	| typeof ClassComponent
	// ... 其余不变
	| typeof MemoComponent;
```

---

### 3.2 fiber.ts：createFiberFromElement 区分 class / function

**设计**

- 当前 `typeof type === 'function'` 时统一为 FunctionComponent；需改为：若 `type.prototype && (type as any).prototype.isReactComponent === true` 则 `fiberTag = ClassComponent`，否则仍为 FunctionComponent。
- ClassComponent 的 fiber 仍用 `fiber.type = type`（类构造函数）、`fiber.pendingProps = props`；state 与 updateQueue 在 beginWork 中初始化（类组件 state 由 instance.state 与 updateQueue 共同决定）。

**实现要点**

```typescript
// packages/react-reconciler/src/fiber.ts

import { ClassComponent } from './workTags';

export function createFiberFromElement(element: ReactElement): FiberNode {
	const { type, key, props, ref } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'function') {
		const proto = type.prototype;
		if (proto && (proto as any).isReactComponent === true) {
			fiberTag = ClassComponent;
		}
	} else if (typeof type === 'string') {
		fiberTag = HostComponent;
	}
	// ... 其余 type 分支不变

	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	fiber.ref = ref;
	return fiber;
}
```

- 若本项目 react 包尚未为 class 组件挂 `isReactComponent`，需在类组件基类或 babel 编译结果中保证 `Component.prototype.isReactComponent = true`（与 React 一致）。

---

### 3.3 fiberThrow.ts：throwException 的 Error 分支与 findErrorBoundary

**设计**

- **throwException**：先判断 value 是否为 thenable（现有逻辑）；再判断是否为 Error（或可抛出的普通对象，可用 `value instanceof Error` 或封装 `isError(value)`）；若为 Error 则执行：`errorBoundary = findErrorBoundary(workInProgress)`；若不为 null 则 `setErrorBoundaryState(errorBoundary, { error, errorInfo })`、`errorBoundary.flags |= ShouldCapture`、`scheduleUpdateOnFiber(errorBoundary, lane)`；否则 `handleUncaughtError(root, value)`。
- **findErrorBoundary(fiber)**：从 `fiber.return` 向上遍历，直到根；对每个节点若 `node.tag === ClassComponent`，则检查 `node.type.getDerivedStateFromError` 或 `node.type.prototype.componentDidCatch` 是否存在（其一即可），是则返回该 node；否则继续向上。
- **setErrorBoundaryState**：将 error、errorInfo 挂到边界 fiber 上，供 beginWork 的 ClassComponent 分支读取并合并进 state，供 commit 时调用 componentDidCatch。两种常见做法：
  - **方案 A**：在 FiberNode 上扩展 `pendingError: { error, errorInfo } | null`（或挂在内部结构上），setErrorBoundaryState 时直接赋值；beginWork 中若存在 pendingError 则调用 getDerivedStateFromError 得到部分 state，与当前 state 合并后写回，并清空 pendingError；commit 时从 fiber 上读 error/errorInfo 调用 componentDidCatch 后清空。
  - **方案 B**：通过类组件的 updateQueue 入队一个「错误更新」；processUpdateQueue 时识别该更新，调用 getDerivedStateFromError 并合并 state。与现有 setState 共用一套队列，但需扩展 Update 类型（如 tag: 'error'）。
- 建议先采用**方案 A**，结构清晰、与现有 updateQueue 解耦；若后续希望错误更新与 setState 统一调度，再考虑方案 B。
- **getErrorInfo(error)**：构造 `{ componentStack: string }`。componentStack 可由开发环境下从当前 fiber 向上遍历生成组件名栈；简化实现可先返回 `{ componentStack: '' }`。
- **handleUncaughtError(root, error)**：未找到边界时的兜底：可 `console.error(error)`、在 root 上挂载 lastUncaughtError、或触发 host 的 onUncaughtError 回调（若存在）。

**实现要点**

```typescript
// packages/react-reconciler/src/fiberThrow.ts

import { FiberNode, FiberRootNode } from './fiber';
import { ClassComponent } from './workTags';
import { ShouldCapture } from './fiberFlags';
import { getSuspenseHandler } from './suspenseContext';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, markRootPinged } from './fiberLanes';
// ... 其余 import

export function throwException(root: FiberRootNode, value: any, lane: Lane) {
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const wakeable = value;
		const suspenseBoundary = getSuspenseHandler();
		if (suspenseBoundary) suspenseBoundary.flags |= ShouldCapture;
		attachPingListener(root, wakeable, lane, suspenseBoundary);
		return;
	}

	if (isError(value)) {
		const errorBoundary = findErrorBoundary(workInProgress);
		if (errorBoundary !== null) {
			errorBoundary.flags |= ShouldCapture;
			setErrorBoundaryState(errorBoundary, {
				error: value,
				errorInfo: getErrorInfo(value, errorBoundary)
			});
			scheduleUpdateOnFiber(errorBoundary, lane);
		} else {
			handleUncaughtError(root, value);
		}
	}
}

function isError(value: any): value is Error {
	return value instanceof Error || value?.constructor?.name === 'Error';
}

function findErrorBoundary(fiber: FiberNode | null): FiberNode | null {
	let node = fiber?.return ?? null;
	while (node !== null) {
		if (node.tag === ClassComponent) {
			const ctor = node.type as any;
			if (
				typeof ctor.getDerivedStateFromError === 'function' ||
				(ctor.prototype &&
					typeof ctor.prototype.componentDidCatch === 'function')
			) {
				return node;
			}
		}
		node = node.return;
	}
	return null;
}

export interface ErrorBoundaryStatePayload {
	error: Error;
	errorInfo: { componentStack: string };
}

export function setErrorBoundaryState(
	fiber: FiberNode,
	payload: ErrorBoundaryStatePayload
) {
	(fiber as any).pendingError = payload;
}

export function getErrorBoundaryState(
	fiber: FiberNode
): ErrorBoundaryStatePayload | null {
	return (fiber as any).pendingError ?? null;
}

export function clearErrorBoundaryState(fiber: FiberNode) {
	(fiber as any).pendingError = null;
}

function getErrorInfo(
	error: Error,
	boundaryFiber?: FiberNode
): { componentStack: string } {
	if (__DEV__ && boundaryFiber) {
		return { componentStack: getComponentStack(boundaryFiber) };
	}
	return { componentStack: '' };
}

function getComponentStack(fiber: FiberNode): string {
	const names: string[] = [];
	let node: FiberNode | null = fiber;
	while (node) {
		const name = getComponentName(node);
		if (name) names.push(name);
		node = node.return;
	}
	return names.join('\n    in ');
}

function getComponentName(fiber: FiberNode): string {
	const type = fiber.type;
	if (typeof type === 'string') return type;
	if (typeof type === 'function')
		return (type as any).displayName ?? type.name ?? 'Component';
	return 'Unknown';
}

function handleUncaughtError(root: FiberRootNode, error: any) {
	if (__DEV__) console.error('Uncaught error in React tree', error);
	(root as any).lastUncaughtError = error;
}
```

- `workInProgress` 需在 throwException 可访问的模块内（通常由 workLoop 在 render 前设置）；若 fiberThrow 与 workLoop 分离，可改为由 throwAndUnwindWorkLoop 将 unitOfWork 传入 throwException，用其作为「抛出点 fiber」向上找边界。

---

### 3.4 fiberUnwindWork.ts：在 Error Boundary 上停靠（DidCapture）

**设计**

- unwind 自下而上遍历时，若当前节点为 ClassComponent 且 `flags & ShouldCapture` 且 `!(flags & DidCapture)`，说明该节点即 throwException 中标记的 Error Boundary，应在此停住：设置 `wip.flags = (flags & ~ShouldCapture) | DidCapture`，并 return wip，使 workInProgress 指向该 fiber，下一轮 beginWork 从该节点开始。
- 与 SuspenseComponent 的停靠逻辑一致：Suspense 是 popSuspenseHandler + ShouldCapture → DidCapture；ClassComponent 无需 pop 栈，仅做 ShouldCapture → DidCapture 并 return wip。
- 其他 tag（含 ContextProvider）保持现有逻辑；ContextProvider 仍只 popProvider 不处理 DidCapture。

**实现要点**

```typescript
// packages/react-reconciler/src/fiberUnwindWork.ts

import { ContextProvider, SuspenseComponent, ClassComponent } from './workTags';

export function unwindWork(wip: FiberNode): FiberNode | null {
	const flags = wip.flags;

	switch (wip.tag) {
		case SuspenseComponent: {
			popSuspenseHandler();
			if (
				(flags & ShouldCapture) !== NoFlags &&
				(flags & DidCapture) === NoFlags
			) {
				wip.flags = (flags & ~ShouldCapture) | DidCapture;
				return wip;
			}
			return null;
		}
		case ClassComponent: {
			if (
				(flags & ShouldCapture) !== NoFlags &&
				(flags & DidCapture) === NoFlags
			) {
				wip.flags = (flags & ~ShouldCapture) | DidCapture;
				return wip;
			}
			return null;
		}
		case ContextProvider: {
			const context = wip.type._context;
			popProvider(context);
			return null;
		}
		default:
			return null;
	}
}
```

---

### 3.5 beginWork.ts：ClassComponent 的 mount / update 与错误态渲染

**设计**

- **case ClassComponent**：调用 `updateClassComponent(wip, renderLane)`。
- **updateClassComponent**：
  - **mount**：`current === null`。创建实例 `new type(pendingProps)`，若有 `getDerivedStateFromProps` 则用 props 得到初始 state；将 instance 挂到 `wip.stateNode`；可选的 ref 赋值；把 instance 的 setState 与 updateQueue 绑定（见下）；调用 `instance.render()` 得到 children，reconcileChildren(wip, children)。
  - **update**：先处理「错误态」：若 `wip.flags & DidCapture` 或 `getErrorBoundaryState(wip) !== null`，则取出 pendingError，调用 `type.getDerivedStateFromError(error)` 得到 partialState，与当前 state 合并后写回 wip.memoizedState（或通过 processUpdateQueue 合并）；然后清空 pendingError（或保留到 commit 后再清，便于 componentDidCatch 使用）。再调用 `instance.render()`，reconcileChildren。
  - **bailout**：与现有逻辑一致，若 didReceiveUpdate 为 false 且当前无 lane 更新，可走 bailoutOnAlreadyFinishedWork；对 ClassComponent 的 bailout 分支同样需考虑「四要素」中 state 是否变化（来自 updateQueue 或 pendingError）。
- **类组件 state 与 updateQueue**：类组件需要自己的 updateQueue（与 HostRoot 的 Element 更新、FC 的 hooks 不同），用于 setState。可复用现有 `UpdateQueue<State>` 与 `processUpdateQueue` 的泛型形态：在 mount 时 `wip.updateQueue = createUpdateQueue()`，`wip.memoizedState = instance.state`；setState 时 enqueueUpdate 并 scheduleUpdateOnFiber；在 updateClassComponent 的 update 分支先 processUpdateQueue 得到新 state，再若有 pendingError 则再合并 getDerivedStateFromError 的结果，最后写回 wip.memoizedState 并赋给 instance.state。
- **getDerivedStateFromProps**：update 时若 props 变化，可调用 `type.getDerivedStateFromProps(nextProps, prevState)` 合并 state，与 getDerivedStateFromError 的合并顺序需约定（一般先 props 再 error）。

**实现要点（精简）**

```typescript
// packages/react-reconciler/src/beginWork.ts

import { getErrorBoundaryState, clearErrorBoundaryState } from './fiberThrow';
import { ClassComponent } from './workTags';
import { processUpdateQueue } from './updateQueue';
import { createUpdateQueue } from './updateQueue';

case ClassComponent:
  return updateClassComponent(wip, renderLane);

function updateClassComponent(wip: FiberNode, renderLane: Lane): FiberNode | null {
  const Component = wip.type as any;
  const instance = wip.stateNode;
  const current = wip.alternate;

  if (instance === null) {
    // mount
    const instance = new Component(wip.pendingProps);
    wip.stateNode = instance;
    instance.updater = classComponentUpdater;  // 供 setState 使用
    wip.updateQueue = createUpdateQueue();
    wip.memoizedState = instance.state ?? null;
    // ref、getDerivedStateFromProps 等略
    const nextChildren = instance.render();
    reconcileChildren(wip, nextChildren);
    return wip.child;
  }

  const pendingError = getErrorBoundaryState(wip);
  if ((wip.flags & DidCapture) !== NoFlags && pendingError !== null) {
    const { error, errorInfo } = pendingError;
    const partialState =
      typeof Component.getDerivedStateFromError === 'function'
        ? Component.getDerivedStateFromError(error)
        : null;
    if (partialState !== null && typeof partialState === 'object') {
      const prevState = wip.memoizedState;
      wip.memoizedState = { ...prevState, ...partialState };
      instance.state = wip.memoizedState;
    }
    wip.flags &= ~DidCapture;
    // 保留 pendingError 到 commit 阶段供 componentDidCatch 使用，commit 后再 clear
  }

  const updateQueue = wip.updateQueue as UpdateQueue<any>;
  if (updateQueue !== null) {
    const baseState = wip.memoizedState;
    const pending = updateQueue.shared.pending;
    updateQueue.shared.pending = null;
    const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);
    wip.memoizedState = memoizedState;
    instance.state = memoizedState;
  }

  const nextChildren = instance.render();
  reconcileChildren(wip, nextChildren);
  return wip.child;
}
```

- classComponentUpdater：提供 `enqueueSetState(instance, update, lane)`，内部取 instance 对应 fiber（可通过 instance.\_reactInternals 或全局 current 映射），enqueueUpdate 并 scheduleUpdateOnFiber；mount 时需把 wip 挂到 instance 上以便 setState 时能找到 fiber。

---

### 3.6 completeWork.ts：ClassComponent

**设计**

- ClassComponent 无 DOM，仅做 `bubbleProperties(wip)` 并 return null，与 FunctionComponent 类似。
- 在 switch 中增加 `case ClassComponent: bubbleProperties(wip); return null;`。

---

### 3.7 commitWork.ts：DidCapture 时调用 componentDidCatch

**设计**

- 在 **commit 阶段**（layout 或 mutation 均可，React 在 commit 阶段调用 componentDidCatch）遍历到某个 fiber 时，若 `tag === ClassComponent` 且 `flags & DidCapture !== 0`，则从该 fiber 上读取 error/errorInfo（getErrorBoundaryState 或此前保留的 pendingError），调用 `instance.componentDidCatch(error, errorInfo)`，然后 clearErrorBoundaryState(fiber)、并清除该 fiber 的 DidCapture 标志，避免重复调用。
- 遍历方式：可在现有 `commitLayoutEffectsOnFiber` 中增加对 ClassComponent + DidCapture 的分支；或单独写一个 `commitErrorBoundaryEffects`，在 commit 的 layout 阶段对整棵 finishedWork 做一次 DFS，仅对带 DidCapture 的 ClassComponent 执行 componentDidCatch。
- 注意：DidCapture 需要在「本次 commit 的 fiber」上存在；若 commit 后清除了 flags，下次不会再执行 componentDidCatch，符合「仅捕获时调用一次」的语义。

**实现要点**

```typescript
// packages/react-reconciler/src/commitWork.ts

import { getErrorBoundaryState, clearErrorBoundaryState } from './fiberThrow';
import { DidCapture } from './fiberFlags';
import { ClassComponent } from './workTags';

const commitLayoutEffectsOnFiber = (finishedWork: FiberNode) => {
	const { flags, tag } = finishedWork;
	// ... Ref 等现有逻辑

	if ((flags & DidCapture) !== NoFlags && tag === ClassComponent) {
		const instance = finishedWork.stateNode;
		const payload = getErrorBoundaryState(finishedWork);
		if (instance && payload) {
			instance.componentDidCatch(payload.error, payload.errorInfo);
			clearErrorBoundaryState(finishedWork);
		}
		finishedWork.flags &= ~DidCapture;
	}
};
```

- 若 DidCapture 在 layout 阶段前已在 mutation 中被其他逻辑消费，可改为在 mutation 中执行 componentDidCatch；与 React 一致即可（React 在 commit 阶段调用）。

---

## 四、错误信息的存储与传递小结

| 阶段                           | 存储位置                                                                                        | 用途                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| throwException 找到边界后      | fiber.pendingError = { error, errorInfo }；fiber.flags \|= ShouldCapture                        | 标记边界并携带错误，供 beginWork 合并 state、commit 时调用 componentDidCatch |
| unwind 停靠                    | fiber.flags \|= DidCapture                                                                      | 表示「该 fiber 为本次捕获的边界」，beginWork 与 commit 据此识别              |
| beginWork updateClassComponent | 读 pendingError，调用 getDerivedStateFromError 合并 state；可清除 DidCapture（或保留到 commit） | 渲染 fallback UI                                                             |
| commitLayoutEffectsOnFiber     | 读 pendingError，调用 componentDidCatch，clearErrorBoundaryState，清除 DidCapture               | 上报/副作用，并清理                                                          |

- pendingError 可在 beginWork 中合并 state 后即清空，仅把 error/errorInfo 存到 fiber 的某字段供 commit 读；也可保留到 commit 后一次性清空，两种皆可，只要 commit 时能拿到即可。

---

## 五、与现有模块的依赖关系

| 模块               | 依赖 / 被依赖                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workTags           | 新增 ClassComponent，被 fiber、beginWork、fiberUnwindWork、commitWork 引用                                                                                                                   |
| fiber.ts           | createFiberFromElement 区分 class/function；FiberNode 可扩展 pendingError（或通过类型断言访问）                                                                                              |
| fiberThrow.ts      | 需能访问 workInProgress（或由 workLoop 传入抛出点 fiber）；调用 scheduleUpdateOnFiber、getSuspenseHandler                                                                                    |
| fiberUnwindWork.ts | 依赖 ClassComponent、DidCapture、ShouldCapture                                                                                                                                               |
| beginWork.ts       | 依赖 ClassComponent、getErrorBoundaryState、clearErrorBoundaryState、updateQueue、processUpdateQueue                                                                                         |
| completeWork.ts    | 仅增加 ClassComponent 的 bubbleProperties                                                                                                                                                    |
| commitWork.ts      | 依赖 ClassComponent、DidCapture、getErrorBoundaryState、clearErrorBoundaryState                                                                                                              |
| workLoop.ts        | 无需改 handleThrow；throwAndUnwindWorkLoop 已调用 throwException，只需 throwException 内部实现 Error 分支；若 workInProgress 在 throwException 中不可见，需将 unitOfWork 传入 throwException |

---

## 六、实现顺序建议

1. **workTags + fiber**：增加 ClassComponent，createFiberFromElement 区分 class/function。
2. **fiberThrow**：实现 findErrorBoundary、setErrorBoundaryState、getErrorBoundaryState、clearErrorBoundaryState、isError、getErrorInfo、handleUncaughtError；在 throwException 中增加 Error 分支。
3. **fiberUnwindWork**：增加 ClassComponent 的 ShouldCapture → DidCapture 停靠。
4. **beginWork**：实现 updateClassComponent（mount/update、state/updateQueue、pendingError 与 getDerivedStateFromError、render、reconcileChildren）；classComponentUpdater 与 setState 绑定可选，可先支持「仅由错误触发的更新」。
5. **completeWork**：ClassComponent 的 bubbleProperties。
6. **commitWork**：commitLayoutEffectsOnFiber 中 ClassComponent + DidCapture 时 componentDidCatch + clear。
7. **联调与测试**：组件 throw Error → 边界显示 fallback → componentDidCatch 被调用；无边界时 handleUncaughtError；与 Suspense 共存时 thenable reject 走 handleSuspenseReject 再 findErrorBoundary。

按上述顺序可实现完整的 Error Boundary 机制，并与现有 Suspense/throw 流程兼容。
