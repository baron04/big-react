import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import {
	basicStateReducer,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	Update,
	UpdateQueue
} from './updateQueue';
import { Action, ReactContext, Thenable, Usable } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import {
	Lane,
	mergeLanes,
	NoLane,
	NoLanes,
	removeLanes,
	requestUpdateLane
} from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';
import currentBatchConfig from 'react/src/currentBatchConfig';
import { REACT_CONTEXT_TYPE } from 'shared/ReactSymbols';
import { trackUsedThenable } from './thenable';
import { markWipReceivedUpdate } from './beginWork';
import { readContext as readContextOrigin } from './fiberContext';

let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
	baseState: any;
	baseQueue: Update<any> | null;
}

export type EffectCallback = () => (() => void) | void;
type EffectDestroy = ReturnType<EffectCallback>;
export type DependencyList = ReadonlyArray<unknown>;

export interface Effect {
	tag: Flags;
	create: EffectCallback;
	destroy: EffectDestroy;
	deps?: DependencyList;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
	lastRenderedState: State;
}

export function renderWithHooks(
	wip: FiberNode,
	Component: FiberNode['type'],
	lane: Lane
) {
	// 赋值操作
	currentlyRenderingFiber = wip;
	// 重置 hooks的链表
	wip.memoizedState = null;
	// 重置 effects 的链表
	wip.updateQueue = null;
	renderLane = lane;

	const current = wip.alternate;
	if (current !== null) {
		// update
		currentDispatcher.current = hooksDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = hooksDispatcherOnMount;
	}

	const props = wip.pendingProps;
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;
	return children;
}

const hooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext,
	use,
	useCallback: mountCallback,
	useMemo: mountMemo
};

const hooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext,
	use,
	useCallback: updateCallback,
	useMemo: updateMemo
};

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	const queue = createFCUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;
	hook.baseState = memoizedState;

	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;
	queue.lastRenderedState = memoizedState;
	return [memoizedState, dispatch];
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: FCUpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);

	// eager 策略
	const current = fiber.alternate;
	if (
		fiber.lanes === NoLanes &&
		(current === null || current.lanes === NoLanes)
	) {
		// 当前产生的 update 是这个 fiber 的第一个 update
		// 1. 更新前的状态  2. 计算状态的方法
		const currentState = updateQueue.lastRenderedState;
		const eagerState = basicStateReducer(currentState, action);
		update.hasEagerState = true;
		update.eagerState = eagerState;

		if (Object.is(currentState, eagerState)) {
			// 命中 eagerState
			enqueueUpdate(updateQueue, update, fiber, NoLane);
			if (__DEV__) {
				console.warn('命中 eagerState', fiber);
			}
			return;
		}
	}

	enqueueUpdate(updateQueue, update, fiber, lane);

	scheduleUpdateOnFiber(fiber, lane);
}

function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null,
		baseState: null,
		baseQueue: null
	};
	if (workInProgressHook === null) {
		// mount时第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内部调用hook');
		} else {
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount 时后续的hook
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}
	return workInProgressHook;
}

function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as FCUpdateQueue<State>;
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	const current = currentHook!;
	let baseQueue = current.baseQueue;

	if (pending !== null) {
		// pending update保存在current中
		if (baseQueue !== null) {
			// baseQueue b2 -> b0 -> b1 -> b2
			// pendingQueue p2 -> p0 -> p1 -> p2
			// b0
			const baseFirst = baseQueue.next;
			// p0
			const pendingFirst = pending.next;
			// b2 -> p0
			baseQueue.next = pendingFirst;
			// p2 -> b0
			pending.next = baseFirst;
			// p2 -> b0 -> b1 -> b2 -> p0 -> p1 -> p2
		}
		baseQueue = pending;
		// 保存在 current 中
		current.baseQueue = pending;
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
		const prevState = hook.memoizedState;
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(baseState, baseQueue, renderLane, (update) => {
			const skippedLane = update.lane;
			const fiber = currentlyRenderingFiber!;
			// NoLanes
			fiber.lanes = mergeLanes(fiber.lanes, skippedLane);
		});

		// NaN === NaN         // false
		// Object.is(NaN, NaN) // true

		// +0 === -0           // true
		// Object.is(+0, -0)   // false

		if (!Object.is(prevState, memoizedState)) {
			markWipReceivedUpdate();
		}

		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;

		queue.lastRenderedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function updateWorkInProgressHook(): Hook {
	let nextCurrentHook: Hook | null = null;

	if (currentHook === null) {
		// 这是个FC update时的第一个hook
		const current = currentlyRenderingFiber?.alternate || null;
		if (current !== null) {
			nextCurrentHook = current?.memoizedState || null;
		} else {
			// mount
			nextCurrentHook = null;
		}
	} else {
		// 这个FC update时 后续的hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的hook比上次执行时多`
		);
	}

	currentHook = nextCurrentHook as Hook;

	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
	};

	if (workInProgressHook === null) {
		// update 时第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内部调用hook');
		} else {
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// update 时后续的hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}

	return workInProgressHook;
}

function mountEffect(create: EffectCallback, deps?: DependencyList) {
	const hook = mountWorkInProgressHook();
	currentlyRenderingFiber!.flags |= PassiveEffect;
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		deps
	);
}

function pushEffect(
	hookFlags: Flags,
	create: EffectCallback,
	destroy: EffectDestroy,
	deps?: DependencyList
) {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber!;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 插入effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

function updateEffect(create: EffectCallback, nextDeps?: DependencyList) {
	const hook = updateWorkInProgressHook();
	let destroy: EffectDestroy;

	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== undefined) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(prevDeps, nextDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较 不相等
		currentlyRenderingFiber!.flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputsEqual(
	prevDeps?: DependencyList,
	nextDeps?: DependencyList
) {
	if (prevDeps === undefined || nextDeps === undefined) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setPending] = mountState(false);
	const hook = mountWorkInProgressHook();
	const start = startTransition.bind(null, setPending);
	hook.memoizedState = start;
	return [isPending, start];
}

function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true);
	const prevTransition = currentBatchConfig.transition;
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);

	currentBatchConfig.transition = prevTransition;
}

function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}

function updateRef<T>(): { current: T } {
	const hook = updateWorkInProgressHook();
	return hook.memoizedState;
}

function readContext<T>(context: ReactContext<T>): T {
	return readContextOrigin(currentlyRenderingFiber, context);
}

function use<T>(usable: Usable<T>): T {
	if (usable !== null && typeof usable === 'object') {
		if (typeof (usable as Thenable<T>).then === 'function') {
			// thenable
			const thenable = usable as Thenable<T>;
			return trackUsedThenable(thenable);
		} else if ((usable as ReactContext<T>).$$typeof === REACT_CONTEXT_TYPE) {
			const context = usable as ReactContext<T>;
			return readContext(context);
		}
	}

	throw new Error('不支持的 use 参数' + usable);
}

export function resetHooksOnUnwind() {
	currentlyRenderingFiber = null;
	currentHook = null;
	workInProgressHook = null;
}

export function bailoutHook(wip: FiberNode, renderLane: Lane) {
	const current = wip.alternate!;
	wip.updateQueue = current.updateQueue;
	wip.flags &= ~PassiveEffect;

	current.lanes = removeLanes(current.lanes, renderLane);
}

export function mountCallback<T>(callback: T, deps?: DependencyList): T {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	hook.memoizedState = [callback, nextDeps];
	return callback;
}

export function updateCallback<T>(callback: T, deps?: DependencyList): T {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const prevState = hook.memoizedState;

	if (nextDeps !== null) {
		const prevDeps = prevState[1];
		if (areHookInputsEqual(prevDeps, nextDeps)) {
			return prevState[0];
		}
	}

	hook.memoizedState = [callback, nextDeps];
	return callback;
}

export function mountMemo<T>(nextCreate: () => T, deps?: DependencyList): T {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const nextValue = nextCreate();
	hook.memoizedState = [nextValue, nextDeps];
	return nextValue;
}

export function updateMemo<T>(nextCreate: () => T, deps?: DependencyList): T {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const prevState = hook.memoizedState;

	if (nextDeps !== null) {
		const prevDeps = prevState[1];
		if (areHookInputsEqual(prevDeps, nextDeps)) {
			return prevState[0];
		}
	}

	const nextValue = nextCreate();
	hook.memoizedState = [nextValue, nextDeps];
	return nextValue;
}
