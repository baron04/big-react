import {
	unstable_ImmediatePriority as ImmediatePriority,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_NormalPriority as NormalPriority,
	unstable_LowPriority as LowPriority,
	unstable_IdlePriority as IdlePriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_shouldYield as shouldYield,
	CallbackNode,
	unstable_getFirstCallbackNode as getFirstCallbackNode,
	unstable_cancelCallback as cancelCallback
} from 'scheduler';

import './style.css';

const root = document.querySelector('#root');

let prevPriority: Priority = IdlePriority;
let curCallback: CallbackNode | null = null;

type Priority =
	| typeof ImmediatePriority
	| typeof UserBlockingPriority
	| typeof NormalPriority
	| typeof LowPriority
	| typeof IdlePriority;

interface Work {
	count: number;
	priority: Priority;
}

const workList: Work[] = [];

[ImmediatePriority, UserBlockingPriority, NormalPriority, LowPriority].forEach(
	(priority) => {
		const btn = document.createElement('button');
		if (root) {
			root.appendChild(btn);
		}
		btn.innerText = [
			'',
			'ImmediatePriority',
			'UserBlockingPriority',
			'NormalPriority',
			'LowPriority'
		][priority];
		btn.onclick = () => {
			workList.unshift({
				count: 100,
				priority: priority as Priority
			});
			schedule();
		};
	}
);

function schedule() {
	const cbNode = getFirstCallbackNode();
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	// 策略逻辑
	if (!curWork) {
		// 没有work需要调度，返回
		curCallback = null;
		if (cbNode) {
			cancelCallback(cbNode);
		}
		return;
	}

	const { priority: curPriority } = curWork;
	if (curPriority === prevPriority) {
		// 如果优先级相同，则不需要调度，退出调度
		return;
	}
	// 准备调度当前最高优先级的work
	// 调度之前，如果有工作在进行，则中断它
	if (cbNode) {
		cancelCallback(cbNode);
	}

	// 调度当前最高优先级的work
	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

function perform(work: Work, didTimeout?: boolean) {
	/**
	 * 1. work.priority
	 * 2. 饥饿问题
	 * 3. 时间切片
	 */
	const needSync = work.priority === ImmediatePriority || didTimeout;

	while ((needSync || !shouldYield()) && work.count > 0) {
		work.count--;
		insertSpan(work.priority + '');
	}

	// 中断执行/执行完
	prevPriority = work.priority;

	if (work.count === 0) {
		const workIndex = workList.indexOf(work);
		workList.splice(workIndex, 1);
		prevPriority = IdlePriority; // 重置优先级
	}

	const prevCallback = curCallback;
	schedule();
	const newCallback = curCallback;
	if (newCallback && prevCallback === newCallback) {
		// callback不变，代表是同一个work，只不过Time Slice时间用尽(5ms)
		return perform.bind(null, work);
	}
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	span.className = `prority-${content}`;
	doSomeBusyWork(10000000);
	root?.appendChild(span);
}

function doSomeBusyWork(len: number) {
	let result = 0;
	while (len--) {
		result += len;
	}
}
