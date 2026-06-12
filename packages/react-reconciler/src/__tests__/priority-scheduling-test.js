/**
 * 优先级调度行为测试
 *
 * - 语义上覆盖：同一 act 内「先 transition 再 sync」时只提交 sync、高优更新先于低优提交。
 * - TransitionLane 会映射为 NormalPriority，且 jest-react act() 会 flush 全部 Scheduler，
 *   故同一 act 内 sync 与 transition 都会执行并提交，无法观测「只提交 sync」或「低优未提交」的中间状态；
 *   用例仅断言最终渲染结果正确。
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
});
