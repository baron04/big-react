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
	getHighestPriorityLane,
	Lane,
	lanesToSchedulerPriority,
	markRootFinished,
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

let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
let rootDoesHavePassiveEffects: boolean = false;

const RootInComplete = 1;
const RootCompleted = 2;
// TODO 执行过程中报错了

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// TODO 调度功能
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

// schedule 阶段入口
function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	const existingCallback = root.callbackNode;

	if (updateLane === NoLane) {
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	if (curPriority === prevPriority) {
		// 不需要调度
		return;
	}

	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}

	let newCallbackNode: CallbackNode | null = null;

	if (updateLane === SyncLane) {
		// 同步优先级 用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度，优先级：', updateLane);
		}
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其它优先级 用宏任务调度
		if (__DEV__) {
			console.log('在宏任务中调度，优先级：', updateLane);
		}
		const schedulerPriority = lanesToSchedulerPriority(updateLane);
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}

	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
}

function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);
	if (nextLane !== SyncLane) {
		// 其它比 SyncLane 低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}

	const existStatus = renderRoot(root, nextLane, false);

	if (existStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLane = NoLane;

		// wip fiberNode 树中flags
		commitRoot(root);
	} else {
		if (__DEV__) {
			console.error('还未实现同步更新结束状态');
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

	const lane = getHighestPriorityLane(root.pendingLanes);
	const currentCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return;
	}

	const needSync = lane === SyncLane || didTimeout;
	// render阶段
	const existStatus = renderRoot(root, lane, !needSync);

	ensureRootIsScheduled(root);

	if (existStatus === RootInComplete) {
		// 中断
		if (root.callbackNode !== currentCallbackNode) {
			return;
		}
		return performConcurrentWorkOnRoot.bind(null, root);
	}

	if (existStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane;
		wipRootRenderLane = NoLane;

		// wip fiberNode 树中flags
		commitRoot(root);
	} else {
		if (__DEV__) {
			console.error('还未实现并发更新结束状态');
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
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}

	if (wipRootRenderLane !== lane) {
		// 初始化
		prepareFreshStack(root, lane);
	}

	do {
		try {
			if (shouldTimeSlice) {
				workLoopConcurrent();
			} else {
				workLoopSync();
			}
			break;
		} catch (error) {
			if (__DEV__) {
				console.error('workLoop发生错误', error);
			}
			workInProgress = null;
		}
	} while (true);

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
