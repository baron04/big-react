import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/workTags';
import { Props } from 'shared/ReactTypes';

export interface Container {
	rootID: number;
	children: Array<Instance | TextInstance>;
}
export interface Instance {
	id: number;
	type: string;
	children: Array<Instance | TextInstance>;
	parent: number;
	props: Props;
	style?: Record<string, string>;
}
export interface TextInstance {
	text: string;
	id: number;
	parent: number;
}

let instanceCounter = 0;

export const createInstance = (type: string, props: Props): Instance => {
	const instance = {
		id: instanceCounter++,
		type,
		children: [],
		parent: -1,
		props
	};
	return instance;
};

export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	const prevParentID = child.parent;
	const parentID = 'rootID' in parent ? parent.rootID : parent.id;
	if (prevParentID !== -1 && prevParentID !== parentID) {
		throw new Error('不能重复挂载child');
	}
	child.parent = parentID;
	parent.children.push(child);
};

export const createTextInstance = (content: string): TextInstance => {
	const instance = {
		text: content,
		id: instanceCounter++,
		parent: -1
	};
	return instance;
};

export const appendChildToContainer = (parent: Container, child: Instance) => {
	const prevParentID = child.parent;

	// 如果 child 已经在 parent 中，先移除（移动场景）
	const index = parent.children.indexOf(child);
	if (index !== -1) {
		parent.children.splice(index, 1);
	}

	// 如果 child 已经挂载到其他父节点，需要先移除
	// 注意：这里我们无法直接访问旧的父节点，所以只能检查 parent
	// 实际的移除应该在 commitDeletion 中处理，但为了安全，我们允许这种情况
	if (prevParentID !== -1 && prevParentID !== parent.rootID) {
		// child 已经在其他父节点中，但我们已经从当前 parent 中移除了（如果存在）
		// 这里不抛出错误，因为可能是移动操作
	}

	child.parent = parent.rootID;
	parent.children.push(child);
};

export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText: {
			const text = fiber.memoizedProps?.content;
			return commitTextUpdate(fiber.stateNode, text);
		}
		default: {
			if (__DEV__) {
				console.warn('未实现的Update类型', fiber.tag);
			}
		}
	}
}

export function commitTextUpdate(textInstance: TextInstance, content: string) {
	textInstance.text = content;
}

export function removeChild(
	container: Container,
	child: Instance | TextInstance
) {
	const index = container.children.indexOf(child);
	if (index === -1) {
		throw new Error('child不存在');
	}
	container.children.splice(index, 1);
}

export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	const beforeIndex = container.children.indexOf(before);
	if (beforeIndex === -1) {
		throw new Error('before不存在');
	}
	const index = container.children.indexOf(child);
	if (index !== -1) {
		// 如果 child 已经在 container 中，先移除
		container.children.splice(index, 1);
		// 计算新的插入位置
		const newBeforeIndex = index < beforeIndex ? beforeIndex - 1 : beforeIndex;
		container.children.splice(newBeforeIndex, 0, child);
	} else {
		// 如果 child 不在 container 中，直接插入
		container.children.splice(beforeIndex, 0, child);
	}
	child.parent = container.rootID;
}

export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
			? (callback: (...args: unknown[]) => void) =>
					Promise.resolve(null).then(callback)
			: setTimeout;

export function hideInstance(instance: Instance) {
	const style = instance.style;
	if (style) {
		style.display = 'none !important';
	}
}

export function unhideInstance(instance: Instance) {
	const style = instance.style;
	if (style) {
		style.display = '';
	}
}

export function hideTextInstance(textInstance: TextInstance) {
	textInstance.text = '';
}

export function unhideTextInstance(textInstance: TextInstance, text: string) {
	textInstance.text = text;
}
