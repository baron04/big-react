import { Container, DOMElement, elementPropsKey } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_runWithPriority,
	unstable_UserBlockingPriority
} from 'scheduler';

const allNativeEvents = ['click'];

type EventCallback = (e: Event) => void;

interface SyntheticEvent extends Event {
	__stopPropagation: boolean;
}

interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}

export function listenToAllSupportedEvents(container: Container) {
	allNativeEvents.forEach((eventType) => {
		container.addEventListener(eventType, (event) => {
			dispatchEvent(container, eventType, event);
		});
	});
}

function createSyntheticEvent(event: Event) {
	const syntheticEvent = event as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;
	const originStopPropagation = event.stopPropagation;
	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			originStopPropagation.call(event);
		}
	};
	return syntheticEvent;
}

function dispatchEvent(container: Container, eventType: string, event: Event) {
	const targetElement = event.target;

	if (targetElement === null) {
		console.warn('事件不存在target', event);
		return;
	}
	// 1. 收集沿途事件
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	// 2. 构造合成事件
	const se = createSyntheticEvent(event);
	// 3. 遍历capture
	triggerEventFlow(capture, se);
	if (!se.__stopPropagation) {
		// 4. 遍历bubble
		triggerEventFlow(bubble, se);
	}
}

function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		unstable_runWithPriority(eventTypeToSchedulePriority(se.type), () => {
			callback(se);
		});

		if (se.__stopPropagation) {
			break;
		}
	}
}

function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		click: ['onClickCapture', 'onClick']
	}[eventType];
}

function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	};

	while (targetElement && targetElement !== container) {
		// 收集
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			const callbackNameList = getEventCallbackNameFromEventType(eventType);
			callbackNameList?.forEach((callbackName, index) => {
				const eventCallback = elementProps[callbackName];
				if (eventCallback) {
					if (index === 0) {
						paths.capture.unshift(eventCallback);
					} else {
						paths.bubble.push(eventCallback);
					}
				}
			});
		}
		targetElement = targetElement.parentNode as DOMElement;
	}

	return paths;
}

function eventTypeToSchedulePriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
