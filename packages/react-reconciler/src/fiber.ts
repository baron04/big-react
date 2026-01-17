import type { Key, Props, ReactElement, Ref } from 'shared/ReactTypes';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	WorkTag
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';
import { REACT_PROVIDER_TYPE } from 'shared/ReactSymbols';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key | null;
	stateNode: any;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	ref: Ref;

	memoizedProps: Props | null;
	memoizedState: any;
	alternate: FiberNode | null;
	flags: Flags;
	subtreeFlags: Flags;
	updateQueue: unknown;
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key | null) {
		this.tag = tag;
		this.key = key || null;
		this.stateNode = null;
		this.type = null;

		// 构成数状结构
		this.return = null;
		this.sibling = null;
		this.child = null;
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		this.pendingProps = pendingProps;
		this.memoizedProps = null;
		this.memoizedState = null;
		this.updateQueue = null;

		this.alternate = null;
		this.flags = NoFlags; // 副作用
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

export interface PendingPassiveEffects {
	unmount: Effect[];
	update: Effect[];
}
export class FiberRootNode {
	container: Container;
	current: FiberNode;
	finishedWork: FiberNode | null;
	pendingLanes: Lanes;
	finishedLane: Lane;
	pendingPassiveEffects: PendingPassiveEffects;

	callbackNode: CallbackNode | null;
	callbackPriority: Lane;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;

		this.callbackNode = null;
		this.callbackPriority = NoLane;

		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
	}
}

export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	let wip = current.alternate;
	if (wip === null) {
		// 首屏渲染wip是null
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;

	// 数据
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;
	wip.ref = current.ref;

	return wip;
};

export function createFiberFromElement(element: ReactElement): FiberNode {
	const { type, key, props, ref } = element;

	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (
		typeof type === 'object' &&
		type !== null &&
		type.$$typeof === REACT_PROVIDER_TYPE
	) {
		fiberTag = ContextProvider;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的type类型', element);
	}

	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	fiber.ref = ref;
	return fiber;
}

export function createFiberFromFragment(
	elements: ReactElement[],
	key: Key | null
): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}
