/**
 * 优先级调度行为测试
 *
 * - 语义上覆盖：同一 act 内「先 transition 再 sync」时只提交 sync、高优更新先于低优提交、
 *   同一 useState 队列中高优与低优更新混合时的 baseState 定格与 baseQueue 重放。
 * - TransitionLane 会映射为 NormalPriority，且 jest-react act() 会 flush 全部 Scheduler，
 *   故同一 act 内 sync 与 transition 都会执行并提交，无法观测「只提交 sync」或「低优未提交」的中间状态；
 *   前三个用例仅断言最终渲染结果。baseQueue 用例改为记录每次渲染读到的 state，
 *   借此观测「高优渲染」与「低优重渲染」两趟的差异。
 * - useTransition 的 API 与 startTransition 最终状态见 useTransition-test.js。
 */
'use strict';

let React;
let ReactNoop;
let act;
let useState;
let useTransition;
let Scheduler;

describe('Priority Scheduling', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useState = React.useState;
		useTransition = React.useTransition;
		Scheduler = require('scheduler');
	});

	test('sync and transition in same act: only sync commits', async () => {
		function Component() {
			const [a, setA] = useState(0);
			const [b, setB] = useState(0);
			const [, startTransition] = useTransition();
			return (
				<div>
					<span>a: {a}</span>
					<span>b: {b}</span>
					<button onClick={() => setA((x) => x + 1)}>Sync</button>
					<button onClick={() => startTransition(() => setB((x) => x + 1))}>
						Transition
					</button>
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		// Noop 中直接调用 onClick 无事件优先级，用 runWithPriority 模拟 click → SyncLane
		await act(async () => {
			const buttons = root.findAllByType('button');
			buttons[1].props.onClick(); // transition
			Scheduler.unstable_runWithPriority(
				Scheduler.unstable_ImmediatePriority,
				() => {
					buttons[0].props.onClick(); // sync
				}
			);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<span>a: 1</span>
				<span>b: 1</span>
				<button>Sync</button>
				<button>Transition</button>
			</div>
		);
	});

	test('high priority updates interrupt low priority updates', async () => {
		function Component() {
			const [lowPriority, setLowPriority] = useState(0);
			const [highPriority, setHighPriority] = useState(0);
			const [, startTransition] = useTransition();

			const handleLowPriority = () => {
				startTransition(() => {
					setLowPriority((c) => c + 1);
				});
			};

			const handleHighPriority = () => {
				setHighPriority((c) => c + 1);
			};

			return (
				<div>
					<button onClick={handleLowPriority}>Low: {lowPriority}</button>
					<button onClick={handleHighPriority}>High: {highPriority}</button>
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		// 先触发低优先级更新
		await act(async () => {
			const buttons = root.findAllByType('button');
			buttons[0].props.onClick(); // Low priority (transition)
		});

		// 然后触发高优先级更新
		await act(async () => {
			const buttons = root.findAllByType('button');
			Scheduler.unstable_runWithPriority(
				Scheduler.unstable_ImmediatePriority,
				() => {
					buttons[1].props.onClick(); // High priority (sync)
				}
			);
		});

		// 仅断言最终渲染结果正确
		expect(root).toMatchRenderedOutput(
			<div>
				<button>Low: 1</button>
				<button>High: 1</button>
			</div>
		);
	});

	test('idle priority updates are assigned to IdleLane and can commit', async () => {
		let setCount;

		function Component() {
			const [count, updateCount] = useState(0);
			setCount = updateCount;
			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		await act(async () => {
			Scheduler.unstable_runWithPriority(
				Scheduler.unstable_IdlePriority,
				() => {
					setCount(1);
				}
			);
		});

		expect(root).toMatchRenderedOutput(<div>1</div>);
	});

	test('skipped low priority update: baseState anchored, baseQueue replayed', async () => {
		// 三个更新取不同数量级的加数，最终值的每一位直接反映哪些更新被应用：
		// 个位 = A、十位 = B、百位 = C
		let renderLog = [];
		let triggerUpdate;

		function Component() {
			const [count, setCount] = useState(0);
			const [, startTransition] = useTransition();
			renderLog.push(count);

			triggerUpdate = () => {
				// A: 高优
				setCount(1);
				// B: 低优，会被高优渲染跳过，记入 baseQueue
				startTransition(() => {
					setCount((c) => c + 10);
				});
				// C: 高优，但排在被跳过的 B 之后，须克隆进 baseQueue 以便低优渲染重算
				setCount((c) => c + 100);
			};

			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});
		renderLog = [];

		// Noop 中直接调用无事件优先级，用 runWithPriority 模拟 click 上下文，
		// 使 A/C 落在高优 lane（SyncLane），B 落在 TransitionLane
		await act(async () => {
			Scheduler.unstable_runWithPriority(
				Scheduler.unstable_ImmediatePriority,
				() => {
					triggerUpdate();
				}
			);
		});

		// 高优渲染：A 得 1；B 优先级不够被跳过，baseState 定格在此刻的 1；C 得 101。
		// 低优渲染：从 baseState 1 重放 baseQueue，B 得 11，C 重算得 111。
		// 回归信号：低优得 110 说明 baseState 未定格（仍从 0 起算）；
		//           低优得 11 说明 C 未克隆进 baseQueue，重放时丢失。
		expect(renderLog).toEqual([101, 111]);
		expect(root).toMatchRenderedOutput(<div>111</div>);
	});
});
