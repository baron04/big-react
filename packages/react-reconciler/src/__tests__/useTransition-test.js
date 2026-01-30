/**
 * useTransition 基础语义测试
 *
 * - 覆盖：返回值 [isPending, startTransition]、初始 isPending 为 false、
 *   startTransition(callback) 内 setState 的最终提交结果。
 * - 与优先级/调度相关（同 act 内 sync vs transition、高优打断低优）见 priority-scheduling-test.js。
 *
 * 测试环境说明：本实现将 TransitionLane 映射为 NormalPriority，且 jest-react 的 act()
 * 会 flush 全部 Scheduler 任务，因此同一 act 内 transition 会执行并提交完毕，
 * 无法在测试中观测「count 未变、isPending 为 true」的中间状态，仅断言最终状态。
 */
'use strict';

let React;
let ReactNoop;
let act;
let useState;
let useTransition;

describe('useTransition', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useState = React.useState;
		useTransition = React.useTransition;
	});

	test('useTransition returns isPending and startTransition', async () => {
		// 仅验证挂载后返回 [isPending, startTransition]，且初始 isPending 为 false
		function Component() {
			const [isPending] = useTransition();
			return <div>{`isPending: ${isPending}`}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(<div>isPending: false</div>);
	});

	// 带 count 与 useTransition 的组件，通过闭包暴露 setCount / startTransition 供测试调用
	let setCountFn, startTransitionFn;
	function CountWithTransition() {
		const [count, setCount] = useState(0);
		const [isPending, startTransition] = useTransition();
		setCountFn = setCount;
		startTransitionFn = startTransition;
		return (
			<div>
				<span>{count}</span>
				<span>{`isPending: ${isPending}`}</span>
			</div>
		);
	}

	test('startTransition updates state correctly', async () => {
		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<CountWithTransition />);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<span>0</span>
				<span>isPending: false</span>
			</div>
		);

		await act(async () => {
			startTransitionFn(() => {
				setCountFn((c) => c + 1);
			});
		});

		// 验证调用 startTransition 后，最终状态 count===1，isPending===false
		expect(root).toMatchRenderedOutput(
			<div>
				<span>1</span>
				<span>isPending: false</span>
			</div>
		);
	});
});
