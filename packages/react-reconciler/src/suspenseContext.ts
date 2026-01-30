import { FiberNode } from './fiber';

const suspenseHandlerStack: FiberNode[] = [];

export function getSuspenseHandler() {
	return suspenseHandlerStack.length > 0
		? suspenseHandlerStack[suspenseHandlerStack.length - 1]
		: null;
}

export function pushSuspenseHandler(handler: FiberNode) {
	suspenseHandlerStack.push(handler);
}

export function popSuspenseHandler() {
	return suspenseHandlerStack.pop();
}
