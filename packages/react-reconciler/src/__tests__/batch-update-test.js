'use strict';

let React;
let ReactNoop;
let act;
let useState;

describe('Batch Updates', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useState = React.useState;
	});

	test('multiple setState calls in event handler are batched', async () => {
		let renderCount = 0;

		function Component() {
			renderCount++;
			const [count1, setCount1] = useState(0);
			const [count2, setCount2] = useState(0);

			const handleClick = () => {
				setCount1((c) => c + 1);
				setCount2((c) => c + 1);
			};

			return (
				<div>
					<span>{count1}</span>
					<span>{count2}</span>
					<button onClick={handleClick}>Update</button>
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(renderCount).toBe(1);

		await act(async () => {
			const button = root.findByType('button');
			button.props.onClick();
		});

		// 应该只渲染一次（批处理）
		expect(renderCount).toBe(2);
		expect(root).toMatchRenderedOutput(
			<div>
				<span>1</span>
				<span>1</span>
				<button>Update</button>
			</div>
		);
	});

	test('updates from different event handlers are not batched', async () => {
		let renderCount = 0;

		function Component() {
			renderCount++;
			const [count, setCount] = useState(0);

			return (
				<div>
					<span>{count}</span>
					<button
						onClick={() => {
							setCount((c) => c + 1);
							setTimeout(() => {
								setCount((c) => c + 1);
							}, 0);
						}}
					>
						Update
					</button>
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(renderCount).toBe(1);

		await act(async () => {
			const button = root.findByType('button');
			button.props.onClick();
			jest.advanceTimersByTime(0);
		});

		// setTimeout 中的更新不应该与事件处理器中的更新批处理
		// 应该渲染两次
		expect(renderCount).toBeGreaterThan(1);
	});
});
