// 简单实现一下react内部scheduler包的源码

// React 的 Scheduler（调度器）核心主要解决两个问题：时间切片（Time Slicing） 和 优先级调度（Priority Scheduling）。
// 为了直观理解，剔除复杂的边缘情况（如 Profiling、复杂的堆排序优化），实现一个最小可用版本

// Scheduler 的核心骨架：
// 1. 任务队列：用数组模拟最小堆。
// 2. 调度机制：MessageChannel 实现宏任务调度（这也是 React 源码中比 setTimeout 更优先的方案）。
// 3. 时间切片：控制任务执行时间，超过阈值（默认 5ms）则暂停，把控制权还给浏览器。

// =============  核心代码实现   =============

/**
 * 1. 优先级定义
 * React 内部有 5 种优先级，这里简化为 3 种以便理解
 */
const ImmediatePriority = 1; // 立即执行
const UserBlockingPriority = 2; // 用户阻塞级别（如点击事件）
const NormalPriority = 3; // 普通优先级

// 对应优先级的超时时间（单位 ms）
const timeoutForPriorityLevel = {
	[ImmediatePriority]: -1,
	[UserBlockingPriority]: 250,
	[NormalPriority]: 5000
};

/**
 * 2. 任务队列 (Min Heap 的简化版)
 * 源码中使用最小堆，这里为了代码简练，使用数组 + 排序模拟
 */
export type TaskCallback = (
	didUserCallbackTimeout: boolean
) => void | TaskCallback;

export interface Task {
	id: number;
	callback: TaskCallback | null;
	priorityLevel: number;
	startTime: number;
	expirationTime: number;
}

const taskQueue: Task[] = [];

// 向队列添加任务
function push(queue: Task[], task: Task) {
	queue.push(task);
	// 每次添加后重新排序，模拟最小堆，expirationTime 越小越靠前
	queue.sort((a: Task, b: Task) => a.expirationTime - b.expirationTime);
}

// 取出最紧急的任务
function peek(queue: Task[]) {
	return queue[0] || null;
}

// 移除最紧急的任务
function pop(queue: Task[]) {
	return queue.shift();
}

/**
 * 3. 时间切片控制
 */
const frameInterval = 5; // React 默认给每个切片 5ms
let deadline = 0; // 当前切片的截止时间

function shouldYieldToHost() {
	// 如果当前时间超过了截止时间，说明该让出主线程了
	return performance.now() >= deadline;
}

/**
 * 4. 调度核心 (MessageChannel)
 * 使用 MessageChannel 在下一次宏任务中执行工作循环
 */
const channel = new MessageChannel();
const port = channel.port2;
let isMessageLoopRunning = false;

type HostCallback = (hasTimeRemaining: boolean, initialTime: number) => boolean;
let scheduledHostCallback: HostCallback | null = null;

// 当 port2 发送消息时，port1 会收到，执行 performWorkUntilDeadline
channel.port1.onmessage = function performWorkUntilDeadline() {
	if (scheduledHostCallback) {
		const currentTime = performance.now();
		// 设定当前切片的截止时间：当前时间 + 5ms
		deadline = currentTime + frameInterval;

		const hasTimeRemaining = true;
		let hasMoreWork = true;

		try {
			// 执行回调（即 flushWork）
			hasMoreWork = scheduledHostCallback(hasTimeRemaining, currentTime);
		} finally {
			if (hasMoreWork) {
				// 如果还有任务没做完，继续发消息调度下一次
				port.postMessage(null);
			} else {
				isMessageLoopRunning = false;
				scheduledHostCallback = null;
			}
		}
	} else {
		isMessageLoopRunning = false;
	}
};

function requestHostCallback(callback: HostCallback) {
	scheduledHostCallback = callback;
	if (!isMessageLoopRunning) {
		isMessageLoopRunning = true;
		// 触发宏任务
		port.postMessage(null);
	}
}

/**
 * 5. 工作循环 (Work Loop)
 * 只要有时间，就一直取任务执行
 */
function workLoop(hasTimeRemaining: boolean, initialTime: number): boolean {
	let currentTime = initialTime;
	let currentTask = peek(taskQueue);

	while (currentTask !== null) {
		if (
			currentTask.expirationTime > currentTime &&
			(!hasTimeRemaining || shouldYieldToHost())
		) {
			// 任务还没过期，但是时间片用完了，跳出循环，等待下次调度
			break;
		}

		// 执行任务
		const callback = currentTask.callback;
		if (typeof callback === 'function') {
			currentTask.callback = null; // 清理

			// 执行真正的任务逻辑
			// 注意：React 任务可能会返回一个函数（continuation），表示任务未完成
			const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
			const continuationCallback = callback(didUserCallbackTimeout);

			if (typeof continuationCallback === 'function') {
				// 如果任务返回了函数，说明任务没做完（被中断了），保留原任务，更新 callback
				currentTask.callback = continuationCallback;
			} else {
				// 任务真正做完了，从队列移除
				if (currentTask === peek(taskQueue)) {
					pop(taskQueue);
				}
			}
		} else {
			pop(taskQueue);
		}

		// 更新当前任务，继续循环
		currentTask = peek(taskQueue);
		currentTime = performance.now();
	}

	// 如果队列里还有任务，返回 true，告诉宿主继续调度
	if (currentTask !== null) {
		return true;
	} else {
		return false;
	}
}

/**
 * 6. 入口函数 scheduleCallback
 */
function scheduleCallback(priorityLevel: number, callback: TaskCallback) {
	const startTime = performance.now();

	// 计算过期时间
	const timeout =
		timeoutForPriorityLevel[
			priorityLevel as keyof typeof timeoutForPriorityLevel
		];
	const expirationTime = startTime + timeout;

	const newTask: Task = {
		id: Math.random(), // 简单模拟 ID
		callback,
		priorityLevel,
		startTime,
		expirationTime
	};

	// 放入队列
	push(taskQueue, newTask);

	// 请求调度
	if (!isMessageLoopRunning) {
		requestHostCallback(workLoop);
	}

	return newTask;
}

// ===============   测试用例    ===============

// 模拟一个耗时任务
function heavyTask(label: string) {
	return () => {
		const start = performance.now();
		while (performance.now() - start < 10) {
			// 空转 10ms，模拟复杂计算
		}
		console.log(`Task ${label} finished at ${performance.now().toFixed(2)}`);
	};
}

console.log('Script Start');

// 1. 插入普通任务
scheduleCallback(NormalPriority, heavyTask('A (Normal)'));

// 2. 插入普通任务
scheduleCallback(NormalPriority, heavyTask('B (Normal)'));

// 3. 插入用户阻塞任务（优先级更高，应该插队到 A 和 B 之前或之间，取决于排序逻辑）
// 注意：我们的简化版排序只看 expirationTime。
// UserBlocking 的 timeout 是 250ms，Normal 是 5000ms。
// 所以 UserBlocking 的 expirationTime 会更小，会被排到前面。
scheduleCallback(UserBlockingPriority, heavyTask('C (UserBlocking)'));

// 4. 插入立即执行任务
scheduleCallback(ImmediatePriority, heavyTask('D (Immediate)'));

console.log('Script End');

// 预期输出顺序：
// Script Start
// Script End
// Task D (Immediate) ... (过期时间最短)
// Task C (UserBlocking) ...
// Task A (Normal) ...
// Task B (Normal) ...

/*
===============  关键点解析   ===============

1. 为什么用 MessageChannel ？

React 需要在当前 JS 执行栈清空后，尽快执行调度任务，但又不能阻塞 UI 渲染。
setTimeout(fn, 0) 实际上有 4ms 的最小延迟（在嵌套调用层级深时）。
requestAnimationFrame 是和帧对齐的，如果一帧内任务很快做完，剩下的时间就浪费了。
MessageChannel 创建的是宏任务，优先级适中，且延迟极低，非常适合用来做“让出主线程后立即回来”的操作。

2. shouldYieldToHost 的逻辑

React 默认给每个任务切片 5ms。
在workLoop 的 while 循环中，每执行完一个小任务，都会检查 performance.now() >= deadline。
如果超时了，workLoop 返回true，performWorkUntilDeadline 就会通过 port.postMessage(null)
再次调度自己，从而把主线程控制权暂时交还给浏览器（让浏览器有机会去绘制页面、响应点击）。

3. 最小堆（Min Heap）的作用

在代码中我用了 Array.sort 模拟。
在真实源码中，React 手写了一个最小堆。
因为任务是不断插入的，我们需要始终能以 O(1) 的复杂度取出过期时间最早（最紧急）的任务。
*/
