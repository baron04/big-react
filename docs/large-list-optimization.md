# big-react vs React 19：大型列表优化对比

## React 19 对大型列表的优化支持

### 1. React Compiler（React 19 新增，编译时优化）

**功能**: 自动应用 `memo`、`useMemo`、`useCallback` 等优化，无需手动添加

**对大型列表的影响**:

- 自动识别哪些列表项需要更新
- 减少不必要的重渲染
- 自动优化列表项的 props 比较

**当前实现状态**: ❌ **不支持**（这是编译时优化，需要编译器支持）

### 2. useDeferredValue Hook（React 18+）

**功能**: 延迟非关键值的更新，让高优先级更新（如用户交互）先执行

**对大型列表的意义**:

- 滚动时，可以延迟列表更新
- 搜索时，可以延迟过滤结果更新
- 保持交互流畅，避免卡顿

**当前实现状态**: ❌ **未实现**

**实现思路**:

```typescript
// 在 packages/react/src/hooks.ts 中添加
export const useDeferredValue: Dispatcher['useDeferredValue'] = <T>(
	value: T
) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useDeferredValue(value);
};

// 在 packages/react-reconciler/src/fiberHooks.ts 中实现
function mountDeferredValue<T>(value: T): T {
	const hook = mountWorkInProgressHook();
	const [deferredValue, setDeferredValue] = mountState(value);

	// 使用 Transition 优先级更新
	const startTransition = mountTransition()[1];

	// 监听 value 变化，使用低优先级更新
	mountEffect(() => {
		startTransition(() => {
			setDeferredValue(value);
		});
	}, [value]);

	hook.memoizedState = deferredValue;
	return deferredValue;
}

function updateDeferredValue<T>(value: T): T {
	const hook = updateWorkInProgressHook();
	const currentValue = hook.memoizedState;

	// 如果值没变化，直接返回
	if (Object.is(currentValue, value)) {
		return currentValue;
	}

	// 使用 Transition 优先级更新
	const [isPending, startTransition] = updateTransition();

	updateEffect(() => {
		startTransition(() => {
			// 这里需要访问 setDeferredValue，需要重新设计
			// 实际上 useDeferredValue 的实现更复杂，需要直接操作 Fiber
		});
	}, [value]);

	return currentValue; // 返回旧值，新值会在低优先级更新中应用
}
```

**更准确的实现思路**（参考官方实现）:

```typescript
// useDeferredValue 的核心是直接使用低优先级 Lane
function mountDeferredValue<T>(value: T): T {
  const hook = mountWorkInProgressHook();
  const [deferredValue, setDeferredValue] = mountState(value);

  // 使用 TransitionLane 而不是 SyncLane
  // 需要在 dispatchSetState 中支持指定 Lane
  hook.memoizedState = {
    baseValue: value,
    deferredValue: value,
    setDeferredValue
  };

  return value;
}

function updateDeferredValue<T>(value: T): T {
  const hook = updateWorkInProgressHook();
  const state = hook.memoizedState;

  if (!Object.is(state.baseValue, value)) {
    // 值变化了，但使用低优先级更新
    const update = createUpdate(value, TransitionLane);
    enqueueUpdate(state.setDeferredValue.updateQueue, update, ...);
    scheduleUpdateOnFiber(currentlyRenderingFiber, TransitionLane);

    // 返回旧值
    return state.deferredValue;
  }

  return state.deferredValue;
}
```

### 3. Concurrent Features（并发特性）

**功能**: 时间切片、优先级调度、可中断渲染

**对大型列表的意义**:

- 将大型列表的渲染任务分割成多个小任务
- 用户交互时可以中断列表渲染
- 逐步渲染列表，不阻塞主线程

**当前实现状态**: ✅ **部分实现**

- ✅ 基础的并发渲染（`workLoopConcurrent`）
- ✅ 时间切片（`unstable_shouldYield`）
- ✅ 优先级调度（Lane 模型）
- ❌ 缺少针对大型列表的特殊优化（如分块渲染）

**可以进一步优化的思路**:

```typescript
// 在 renderRoot 中，对于大型列表可以分块处理
function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	// 检测是否是大型列表渲染
	if (shouldTimeSlice && isLargeListRendering(workInProgress)) {
		return renderLargeListInChunks(root, lane);
	}

	// 原有逻辑...
}

function renderLargeListInChunks(root: FiberRootNode, lane: Lane) {
	const chunkSize = 50; // 每块处理 50 个节点
	let processedCount = 0;

	while (workInProgress !== null) {
		// 处理一个 chunk
		for (let i = 0; i < chunkSize && workInProgress !== null; i++) {
			performUnitOfWork(workInProgress);
			processedCount++;
		}

		// 检查是否需要让出控制权
		if (unstable_shouldYield()) {
			// 调度继续处理
			scheduleCallback(NormalPriority, () => {
				renderLargeListInChunks(root, lane);
			});
			return RootInComplete;
		}
	}

	return RootCompleted;
}
```

### 4. 改进的 Diff 算法

**React 19 的优化**:

- 更智能的 key 匹配
- 批量更新优化
- 针对大型列表的特殊优化

**当前实现状态**: ⚠️ **基础实现，缺少优化**

- ✅ 基础的 Diff 算法（`reconcileChildrenArray`）
- ✅ key 匹配和复用
- ❌ 对所有列表使用相同算法，没有针对大型列表的优化
- ❌ 缺少增量 Diff（只 diff 变化的部分）

**优化思路**:

```typescript
// 在 childFibers.ts 中优化
const LARGE_LIST_THRESHOLD = 100; // 超过 100 项视为大型列表

function reconcileChildrenArray(
  returnFiber: FiberNode,
  currentFirstChild: FiberNode | null,
  newChild: any[]
) {
  // 如果是大型列表，使用优化算法
  if (newChild.length > LARGE_LIST_THRESHOLD) {
    return reconcileLargeList(returnFiber, currentFirstChild, newChild);
  }

  // 小型列表使用原有算法
  return reconcileSmallList(returnFiber, currentFirstChild, newChild);
}

function reconcileLargeList(...) {
  // 优化 1: 快速检测是否有变化
  if (quickCheckNoChange(currentFirstChild, newChild)) {
    return currentFirstChild; // 完全没变化，直接复用
  }

  // 优化 2: 检测是否只是追加
  if (isAppendOnly(currentFirstChild, newChild)) {
    return reconcileAppendOnly(returnFiber, currentFirstChild, newChild);
  }

  // 优化 3: 检测是否只是删除
  if (isDeleteOnly(currentFirstChild, newChild)) {
    return reconcileDeleteOnly(returnFiber, currentFirstChild, newChild);
  }

  // 优化 4: 使用更高效的算法（如最长递增子序列 LIS）
  return reconcileWithLIS(returnFiber, currentFirstChild, newChild);
}

// 快速检测是否有变化
function quickCheckNoChange(
  currentFirstChild: FiberNode | null,
  newChild: any[]
): boolean {
  if (currentFirstChild === null && newChild.length === 0) return true;
  if (currentFirstChild === null || newChild.length === 0) return false;

  // 检查长度
  let currentCount = 0;
  let current = currentFirstChild;
  while (current !== null) {
    currentCount++;
    current = current.sibling;
  }
  if (currentCount !== newChild.length) return false;

  // 检查 key 集合是否相同（快速检查）
  const currentKeys = new Set();
  current = currentFirstChild;
  while (current !== null) {
    currentKeys.add(current.key);
    current = current.sibling;
  }

  const newKeys = new Set(newChild.map(item => item?.key));
  if (currentKeys.size !== newKeys.size) return false;

  for (const key of newKeys) {
    if (!currentKeys.has(key)) return false;
  }

  return true;
}

// 检测是否只是追加
function isAppendOnly(
  currentFirstChild: FiberNode | null,
  newChild: any[]
): boolean {
  if (currentFirstChild === null) return true;

  // 检查新列表的前 N 项是否与 current 完全匹配
  let current = currentFirstChild;
  let i = 0;

  while (current !== null && i < newChild.length) {
    const newItem = newChild[i];
    if (current.key !== newItem?.key || current.type !== newItem?.type) {
      return false;
    }
    current = current.sibling;
    i++;
  }

  // current 遍历完了，newChild 还有剩余，说明是追加
  return current === null && i < newChild.length;
}

// 使用最长递增子序列（LIS）优化移动操作
function reconcileWithLIS(
  returnFiber: FiberNode,
  currentFirstChild: FiberNode | null,
  newChild: any[]
) {
  // 1. 建立 key 到 index 的映射
  const keyToIndex = new Map();
  newChild.forEach((item, index) => {
    if (item?.key != null) {
      keyToIndex.set(item.key, index);
    }
  });

  // 2. 找到可以复用的节点及其在新列表中的位置
  const reusableNodes: Array<{ fiber: FiberNode; newIndex: number }> = [];
  let current = currentFirstChild;
  let oldIndex = 0;

  while (current !== null) {
    if (current.key != null) {
      const newIndex = keyToIndex.get(current.key);
      if (newIndex !== undefined) {
        reusableNodes.push({ fiber: current, newIndex });
      }
    }
    current = current.sibling;
    oldIndex++;
  }

  // 3. 计算最长递增子序列（LIS）
  // LIS 中的节点不需要移动，只需要更新
  const lis = calculateLIS(reusableNodes.map(n => n.newIndex));

  // 4. 根据 LIS 结果进行 reconcile
  // LIS 中的节点：更新但不移动
  // 不在 LIS 中的节点：需要移动
  // 新节点：需要创建
  // ...
}
```

### 5. 更智能的 Bailout 策略

**React 19 的优化**:

- 列表项级别的 bailout
- 批量 bailout 优化
- 更精确的依赖检测

**当前实现状态**: ⚠️ **基础实现，可以优化**

- ✅ 基础的 bailout 四要素检查
- ✅ 子树级别的 bailout
- ❌ 缺少列表项级别的 bailout
- ❌ 缺少批量 bailout 优化

**优化思路**:

```typescript
// 在 beginWork 中，对于列表项可以特殊处理
function beginWork(wip: FiberNode, renderLane: Lane): FiberNode | null {
	// 如果是列表项（有明确的 key 和 index），可以快速 bailout
	if (isListItem(wip)) {
		if (shouldBailoutListItem(wip, renderLane)) {
			return bailoutListItem(wip, renderLane);
		}
	}

	// 原有逻辑...
}

function shouldBailoutListItem(wip: FiberNode, renderLane: Lane): boolean {
	const current = wip.alternate;
	if (current === null) return false;

	// 快速检查：key 和 type 是否变化
	if (current.key !== wip.key || current.type !== wip.type) {
		return false;
	}

	// 检查 props（浅比较）
	if (!shallowEqual(current.memoizedProps, wip.pendingProps)) {
		return false;
	}

	// 检查是否有更新
	if (includeSomeLanes(current.lanes, renderLane)) {
		return false;
	}

	// 检查 context
	if (hasContextChange(current, renderLane)) {
		return false;
	}

	return true;
}

function bailoutListItem(wip: FiberNode, renderLane: Lane): FiberNode | null {
	// 直接复用子节点，跳过 reconcile
	cloneChildFiber(wip);
	return wip.child;
}

// 批量 bailout：如果连续多个列表项都可以 bailout
function batchBailoutListItems(
	wip: FiberNode,
	renderLane: Lane
): FiberNode | null {
	let node = wip;
	let bailoutCount = 0;
	const MAX_BATCH_BAILOUT = 10; // 最多批量处理 10 个

	while (node !== null && bailoutCount < MAX_BATCH_BAILOUT) {
		if (isListItem(node) && shouldBailoutListItem(node, renderLane)) {
			bailoutListItem(node, renderLane);
			bailoutCount++;
			node = node.sibling;
		} else {
			break;
		}
	}

	return node; // 返回第一个不能 bailout 的节点
}
```

### 6. useMemo 和 useCallback 优化

**功能**: 缓存计算结果和函数引用

**对大型列表的意义**:

- 避免列表项的不必要重渲染
- 缓存列表的过滤、排序结果

**当前实现状态**: ✅ **已实现**

- ✅ `useMemo` 已实现
- ✅ `useCallback` 已实现
- ✅ `memo` 已实现

### 7. useTransition 优化

**功能**: 标记非关键更新为过渡更新

**对大型列表的意义**:

- 列表过滤、排序可以标记为过渡更新
- 保持用户交互流畅

**当前实现状态**: ✅ **已实现**

- ✅ `useTransition` 已实现
- ✅ `startTransition` 已实现
- ✅ TransitionLane 优先级支持

## 总结对比

| 优化特性            | React 19 | 当前实现            | 优先级 |
| ------------------- | -------- | ------------------- | ------ |
| React Compiler      | ✅       | ❌ 不支持（编译时） | -      |
| useDeferredValue    | ✅       | ❌ 未实现           | 🔴 高  |
| Concurrent Features | ✅       | ⚠️ 部分实现         | 🟡 中  |
| 大型列表 Diff 优化  | ✅       | ❌ 未实现           | 🟡 中  |
| 智能 Bailout        | ✅       | ⚠️ 基础实现         | 🟢 低  |
| useMemo/useCallback | ✅       | ✅ 已实现           | -      |
| useTransition       | ✅       | ✅ 已实现           | -      |

## 实现优先级建议

### 高优先级：useDeferredValue

**原因**:

- 实现相对简单（基于现有的 useTransition）
- 对大型列表性能提升明显
- 是 React 18+ 的标准 API

**实现步骤**:

1. 在 `Dispatcher` 接口中添加 `useDeferredValue`
2. 在 `fiberHooks.ts` 中实现 `mountDeferredValue` 和 `updateDeferredValue`
3. 使用 `TransitionLane` 优先级更新
4. 返回旧值，新值在低优先级更新中应用

### 中优先级：大型列表 Diff 优化

**原因**:

- 性能提升明显（特别是 1000+ 项的列表）
- 可以显著减少不必要的 DOM 操作

**实现步骤**:

1. 在 `reconcileChildrenArray` 中检测大型列表
2. 实现快速变化检测（`quickCheckNoChange`）
3. 实现特殊场景优化（追加、删除）
4. 可选：实现 LIS 算法优化移动操作

### 低优先级：智能 Bailout 优化

**原因**:

- 当前实现已经可以工作
- 优化收益相对较小
- 实现复杂度较高

**实现步骤**:

1. 实现列表项级别的 bailout 检测
2. 实现批量 bailout 机制
3. 优化 bailout 的判断逻辑

## 实现示例：useDeferredValue

```typescript
// packages/react/src/hooks.ts
export const useDeferredValue: Dispatcher['useDeferredValue'] = <T>(
	value: T
) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useDeferredValue(value);
};

// packages/react/src/currentDispatcher.ts
export interface Dispatcher {
	// ... 其他 hooks
	useDeferredValue: <T>(value: T) => T;
}

// packages/react-reconciler/src/fiberHooks.ts
function mountDeferredValue<T>(value: T): T {
	const hook = mountWorkInProgressHook();
	hook.memoizedState = value;
	return value;
}

function updateDeferredValue<T>(value: T): T {
	const hook = updateWorkInProgressHook();
	const prevValue = hook.memoizedState;

	// 如果值没变化，直接返回
	if (Object.is(prevValue, value)) {
		return prevValue;
	}

	// 值变化了，但使用低优先级更新
	// 这里需要调度一个低优先级的更新来应用新值
	const fiber = currentlyRenderingFiber!;
	const update = createUpdate(value, TransitionLane);

	// 创建一个特殊的 updateQueue 来存储 deferred value
	if (fiber.updateQueue === null) {
		fiber.updateQueue = createUpdateQueue();
	}

	enqueueUpdate(
		fiber.updateQueue as UpdateQueue<T>,
		update,
		fiber,
		TransitionLane
	);
	scheduleUpdateOnFiber(fiber, TransitionLane);

	// 返回旧值，新值会在低优先级更新中应用
	return prevValue;
}

// 在 beginWork 中处理 deferred value 的更新
function updateFunctionComponent(
	wip: FiberNode,
	Component: FiberNode['type'],
	renderLane: Lane
) {
	// ... 原有逻辑

	// 检查是否有 deferred value 更新需要应用
	if (renderLane === TransitionLane) {
		// 应用 deferred value 更新
		applyDeferredValueUpdates(wip);
	}

	// ... 原有逻辑
}
```

## 总结

当前实现缺少的主要优化：

1. **useDeferredValue**: 最重要的缺失，实现相对简单，收益大
2. **大型列表 Diff 优化**: 性能提升明显，但实现复杂度较高
3. **智能 Bailout**: 可以进一步优化，但当前实现已经可用

建议优先实现 `useDeferredValue`，这是 React 18+ 的标准 API，对大型列表的性能提升最明显。
