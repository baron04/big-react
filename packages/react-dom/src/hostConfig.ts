import { FiberNode } from 'react-reconciler/src/fiber';
import { HostComponent, HostText } from 'react-reconciler/src/workTags';
import { Props } from 'shared/ReactTypes';

// DOM 节点上挂载的 React props 的 key，用于事件委托时从 event.target 取回 props
export const elementPropsKey = '__props';

export interface DOMElement extends Element {
	[elementPropsKey]?: Props;
}

export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props;
}

// 仅将 className、style 应用到 DOM，其余仅存于 fiberProps（事件委托等）。见 README「与 React 18 的差异」
function applyPropsToDOM(dom: HTMLElement, props: Props) {
	for (const prop in props) {
		if (prop === 'style') {
			Object.assign(dom.style, props.style);
		} else if (prop === 'className') {
			dom.setAttribute('class', props.className ?? '');
		}
	}
}

export type Container = Element;
export type Instance = Element;
export type TextInstance = Text;

export const createInstance = (type: string, props: Props): Instance => {
	const element = document.createElement(type) as unknown as DOMElement;
	applyPropsToDOM(element as unknown as HTMLElement, props);
	updateFiberProps(element, props);
	return element;
};

export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	return parent.appendChild(child);
};

export const createTextInstance = (content: string): TextInstance => {
	return document.createTextNode(content);
};

export const appendChildToContainer = appendInitialChild;

export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText: {
			const text = fiber.memoizedProps?.content;
			return commitTextUpdate(fiber.stateNode, text);
		}
		case HostComponent: {
			const dom = fiber.stateNode as DOMElement;
			const props = fiber.memoizedProps || {};
			applyPropsToDOM(dom as unknown as HTMLElement, props);
			updateFiberProps(dom, props);
			return;
		}
		default: {
			if (__DEV__) {
				console.warn('未实现的Update类型', fiber.tag);
			}
		}
	}
}

export function commitTextUpdate(textInstance: TextInstance, content: string) {
	textInstance.textContent = content;
}

export function removeChild(
	container: Container,
	child: Instance | TextInstance
) {
	return container.removeChild(child);
}

export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	return container.insertBefore(child, before);
}

export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
			? (callback: (...args: unknown[]) => void) =>
					Promise.resolve(null).then(callback)
			: setTimeout;

export function hideInstance(instance: Instance) {
	const style = (instance as HTMLElement).style;
	style.setProperty('display', 'none', 'important');
}

export function unhideInstance(instance: Instance) {
	const style = (instance as HTMLElement).style;
	style.display = '';
}

export function hideTextInstance(textInstance: TextInstance) {
	textInstance.nodeValue = '';
}

export function unhideTextInstance(textInstance: TextInstance, text: string) {
	textInstance.nodeValue = text;
}
