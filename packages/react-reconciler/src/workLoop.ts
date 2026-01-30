import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitLayoutEffects,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	createWorkInProgress,
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	getNextLane,
	Lane,
	lanesToSchedulerPriority,
	markRootFinished,
	markRootSuspended,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { HostRoot } from './workTags';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback,
	CallbackNode
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';
import { getSuspendedThenable, SuspenseException } from './thenable';
import { resetHooksOnUnwind } from './fiberHooks';
import { throwException } from './fiberThrow';
import { unwindWork } from './fiberUnwindWork';

let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
let rootDoesHavePassiveEffects: boolean = false;

// 工作中的状态
const RootInProgress = 0;
// 并发更新，中途打断
const RootInComplete = 1;
// render 完成
const RootCompleted = 2;
// 由于挂起，当前是未完成状态，不用进入commit阶段
const RootDidNotComplete = 3;

let wipRootExitStatus: number = RootInProgress;

const NotSuspended = 0;
const SuspendedOnData = 1;
type SuspendedReason = typeof NotSuspended | typeof SuspendedOnData;
let wipSuspendedReason: SuspendedReason = NotSuspended;
let wipThrownValue: unknown = null;

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;

	wipRootExitStatus = RootInProgress;
	wipSuspendedReason = NotSuspended;
	wipThrownValue = null;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	const root = markUpdateLaneFromFiberToRoot(fiber, lane);
	if (root === null) {
		if (__DEV__) {
			console.warn('scheduleUpdateOnFiber: 无法找到 FiberRootNode');
		}
		return;
	}
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

// schedule 阶段入口
export function ensureRootIsScheduled(root: FiberRootNode) {
	/**
	 * 调度模型（简化版）：
	 *
	 * - 微任务（microtask）
	 *   - SyncLane：通过 `scheduleSyncCallback` 收集同步回调，然后使用 `scheduleMicroTask(flushSyncCallbacks)`
	 *     在微任务中统一 flush（不走 Scheduler 的宏任务队列）。
	 *
	 * - 宏任务（macrotask）
	 *   - 非 SyncLane 且可调度的 lane（含 TransitionLane）：通过 `scheduler.unstable_scheduleCallback(...)` 调度
	 *     `performConcurrentWorkOnRoot`（由 Scheduler 驱动执行，可被 time-slicing/yield）。与官方 React 一致。
	 */
	const nextLane = getNextLane(root);
	const existingCallbackNode = root.callbackNode;
	const existingCallbackPriority = root.callbackPriority;

	// 1) 没有待处理更新：取消已存在的调度
	if (nextLane === NoLane) {
		if (existingCallbackNode !== null) {
			// 取消已有的 Scheduler 宏任务（如果存在）
			unstable_cancelCallback(existingCallbackNode);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	// 2) 调度优先级不变：复用已有调度
	if (existingCallbackPriority === nextLane) {
		return;
	}

	// 3) 调度优先级变化：取消旧的调度（如果有）
	if (existingCallbackNode !== null) {
		// 取消旧的 Scheduler 宏任务（如果存在）
		unstable_cancelCallback(existingCallbackNode);
	}

	// 4) SyncLane：通过微任务 flush sync callback（不走 Scheduler）
	if (nextLane === SyncLane) {
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		// 微任务：flush 由 `scheduleSyncCallback` 收集的同步任务
		scheduleMicroTask(flushSyncCallbacks);
		root.callbackNode = null;
		root.callbackPriority = SyncLane;
		return;
	}

	// 5) 其它 Lane：交给 Scheduler
	const schedulerPriority = lanesToSchedulerPriority(nextLane);
	const newCallbackNode: CallbackNode = scheduleCallback(
		schedulerPriority,
		performConcurrentWorkOnRoot.bind(null, root)
	);
	root.callbackNode = newCallbackNode;
	root.callbackPriority = nextLane;
}

export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

function markUpdateLaneFromFiberToRoot(fiber: FiberNode, lane: Lane) {
	fiber.lanes = mergeLanes(fiber.lanes, lane);
	const alternate = fiber.alternate;
	if (alternate !== null) {
		alternate.lanes = mergeLanes(alternate.lanes, lane);
	}

	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		parent.childLanes = mergeLanes(parent.childLanes, lane);
		const alternate = parent.alternate;
		if (alternate !== null) {
			alternate.childLanes = mergeLanes(alternate.childLanes, lane);
		}
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getNextLane(root);
	if (nextLane !== SyncLane) {
		// 其它比 SyncLane 低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}

	const existStatus = renderRoot(root, nextLane, false);

	switch (existStatus) {
		case RootCompleted: {
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			root.finishedLane = nextLane;
			wipRootRenderLane = NoLane;

			// wip fiberNode 树中flags
			commitRoot(root);
			break;
		}
		case RootDidNotComplete: {
			wipRootRenderLane = NoLane;
			markRootSuspended(root, nextLane);
			ensureRootIsScheduled(root);
			break;
		}
		default: {
			if (__DEV__) {
				console.error('还未实现同步更新结束状态');
			}
		}
	}
}

function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): void | ((didTimeout: boolean) => void) {
	// 保证 useEffect 回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		if (root.callbackNode !== curCallback) {
			return;
		}
	}

	const lane = getNextLane(root);
	const currentCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return;
	}

	const needSync = lane === SyncLane || didTimeout;
	// render阶段
	const existStatus = renderRoot(root, lane, !needSync);

	switch (existStatus) {
		case RootInComplete: {
			// 中断
			if (root.callbackNode !== currentCallbackNode) {
				return;
			}
			return performConcurrentWorkOnRoot.bind(null, root);
		}
		case RootCompleted: {
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			root.finishedLane = lane;
			wipRootRenderLane = NoLane;

			// wip fiberNode 树中flags
			commitRoot(root);
			break;
		}
		case RootDidNotComplete: {
			wipRootRenderLane = NoLane;
			markRootSuspended(root, lane);
			ensureRootIsScheduled(root);
			break;
		}
		default: {
			if (__DEV__) {
				console.error('还未实现并发更新结束状态');
			}
		}
	}
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	// if (__DEV__) {
	// 	console.warn('commit阶段开始', finishedWork);
	// }

	const lane = root.finishedLane;
	if (lane === NoLane && __DEV__) {
		console.error('commit 阶段 finishedLane 不应该是 NoLane');
	}

	// 重置
	root.finishedWork = null;
	root.finishedLane = NoLane;
	markRootFinished(root, lane);

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		if (!rootDoesHavePassiveEffects) {
			rootDoesHavePassiveEffects = true;
			// 调度副作用
			scheduleCallback(NormalPriority, () => {
				// 执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 判断是否存在3个子阶段需要执行的操作
	// root flags root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// 阶段1/3: beforeMutation

		// 阶段2/3: Mutation
		commitMutationEffects(finishedWork, root);
		// fiber tree 切换
		root.current = finishedWork;

		// 阶段3/3: Layout
		commitLayoutEffects(finishedWork, root);
	} else {
		// fiber tree 切换
		root.current = finishedWork;
	}

	rootDoesHavePassiveEffects = false;
	ensureRootIsScheduled(root);
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	// if (__DEV__) {
	// 	console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	// }

	if (wipRootRenderLane !== lane) {
		// 初始化
		prepareFreshStack(root, lane);
	}

	do {
		try {
			if (wipSuspendedReason !== NotSuspended && workInProgress !== null) {
				const thrownValue = wipThrownValue;
				wipSuspendedReason = NotSuspended;
				wipThrownValue = null;
				throwAndUnwindWorkLoop(root, workInProgress, thrownValue, lane);
			}

			if (shouldTimeSlice) {
				workLoopConcurrent();
			} else {
				workLoopSync();
			}
			break;
		} catch (error) {
			if (__DEV__) {
				console.warn('workLoop发生错误', error);
			}
			handleThrow(root, error);
		}
	} while (true);

	if (wipRootExitStatus !== RootInProgress) {
		return wipRootExitStatus;
	}

	// 中断执行/render阶段执行完
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}
	// render 阶段执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error('render 阶段结束时 wip 不应该不是 null');
	}
	// TODO 报错
	return RootCompleted;
}

function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber, wipRootRenderLane);
	fiber.memoizedProps = fiber.pendingProps;
	if (next === null) {
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}

function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;
		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;

	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];

	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

function handleThrow(_root: FiberRootNode, thrownValue: unknown) {
	// Error Boundary

	if (thrownValue === SuspenseException) {
		thrownValue = getSuspendedThenable();
		wipSuspendedReason = SuspendedOnData;
	}
	wipThrownValue = thrownValue;
}

function throwAndUnwindWorkLoop(
	root: FiberRootNode,
	unitOfWork: FiberNode,
	thrownValue: unknown,
	lane: Lane
) {
	// 重置 FC 全局变量
	resetHooksOnUnwind();
	// 请求返回后重新触发更新
	throwException(root, thrownValue, lane);
	// unwind
	unwindUnitOfWork(unitOfWork);
}

function unwindUnitOfWork(unitOfWork: FiberNode) {
	let incompleteWork: FiberNode | null = unitOfWork;

	do {
		const next = unwindWork(incompleteWork);
		if (next !== null) {
			workInProgress = next;
			return;
		}

		const returnFiber: FiberNode | null = incompleteWork.return;
		if (returnFiber !== null) {
			returnFiber.deletions = null;
		}
		incompleteWork = returnFiber;
	} while (incompleteWork !== null);

	// 使用了 use，抛出了 data，但是没有定义 Suspense
	wipRootExitStatus = RootDidNotComplete;
	workInProgress = null;
}
