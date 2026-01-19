import { Wakeable } from 'shared/ReactTypes';
import { FiberNode, FiberRootNode } from './fiber';
import {
	ensureRootIsScheduled,
	markRootUpdated,
	scheduleUpdateOnFiber
} from './workLoop';
import { Lane, markRootPinged } from './fiberLanes';
import { getSuspenseHandler } from './suspenseContext';
import { ShouldCapture } from './fiberFlags';

export function throwException(root: FiberRootNode, value: any, lane: Lane) {
	// Error Boundary

	// thenable
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const wakeable: Wakeable<any> = value;

		const suspenseBoundary = getSuspenseHandler();
		if (suspenseBoundary) {
			suspenseBoundary.flags |= ShouldCapture;
		}

		attachPingListener(root, wakeable, lane, suspenseBoundary);
	}
}

function attachPingListener(
	root: FiberRootNode,
	wakeable: Wakeable<any>,
	lane: Lane,
	suspenseBoundary: FiberNode | null
) {
	// wakeable.then(ping, ping)
	let pingCache = root.pingCache;
	let threadIDs: Set<Lane> | undefined;

	if (pingCache === null) {
		threadIDs = new Set<Lane>();
		pingCache = root.pingCache = new WeakMap<Wakeable<any>, Set<Lane>>();
		pingCache.set(wakeable, threadIDs);
	} else {
		threadIDs = pingCache.get(wakeable);
		if (threadIDs === undefined) {
			threadIDs = new Set<Lane>();
			pingCache.set(wakeable, threadIDs);
		}
	}

	// 第一次进入
	if (!threadIDs.has(lane)) {
		threadIDs.add(lane);

		function ping() {
			if (pingCache !== null) {
				pingCache.delete(wakeable);
			}
			markRootPinged(root, lane);
			if (suspenseBoundary !== null) {
				scheduleUpdateOnFiber(suspenseBoundary, lane);
			} else {
				markRootUpdated(root, lane);
				ensureRootIsScheduled(root);
			}
		}

		wakeable.then(ping, ping);
	}
}
