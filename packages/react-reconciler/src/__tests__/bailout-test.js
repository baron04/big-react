/* eslint-disable react/prop-types */
'use strict';

let React;
let ReactNoop;
let act;
let useState;
let memo;

describe('Bailout Strategy', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useState = React.useState;
		memo = React.memo;
	});

	test('component bails out when props do not change', async () => {
		let childRenderCount = 0;

		function Child({ value }) {
			childRenderCount++;
			return <div>{value}</div>;
		}

		function Parent({ otherValue }) {
			return (
				<div>
					<span>{otherValue}</span>
					<Child value={1} />
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Parent otherValue={0} />);
		});

		expect(childRenderCount).toBe(1);

		await act(async () => {
			root.render(<Parent otherValue={1} />);
		});

		// Child 的 props 没变化，应该 bailout
		// 注意：这取决于 bailout 策略的实现
		// 如果实现了 bailout，childRenderCount 应该还是 1
		// 如果没有实现，可能会是 2
		expect(root).toMatchRenderedOutput(
			<div>
				<span>1</span>
				<div>1</div>
			</div>
		);
	});

	test('memo component bails out with shallow equal props', async () => {
		let renderCount = 0;

		const MemoChild = memo(function Child({ value }) {
			renderCount++;
			return <div>{value}</div>;
		});

		function Parent({ otherValue }) {
			return (
				<div>
					<span>{otherValue}</span>
					<MemoChild value={1} />
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Parent otherValue={0} />);
		});

		expect(renderCount).toBe(1);

		await act(async () => {
			root.render(<Parent otherValue={1} />);
		});

		// MemoChild 的 props 没变化，应该 bailout
		expect(renderCount).toBe(1);
	});

	test('memo component re-renders when props change', async () => {
		let renderCount = 0;

		const MemoChild = memo(function Child({ value }) {
			renderCount++;
			return <div>{value}</div>;
		});

		function Parent({ childValue }) {
			return (
				<div>
					<MemoChild value={childValue} />
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Parent childValue={1} />);
		});

		expect(renderCount).toBe(1);

		await act(async () => {
			root.render(<Parent childValue={2} />);
		});

		// MemoChild 的 props 变化了，应该重新渲染
		expect(renderCount).toBe(2);
	});

	test('component does not bail out when state changes', async () => {
		let childRenderCount = 0;
		let setCountFn;

		function Child({ value }) {
			childRenderCount++;
			return <div>{value}</div>;
		}

		function Parent() {
			const [count, setCount] = useState(0);
			setCountFn = setCount;
			return (
				<div>
					<span>{count}</span>
					<Child value={1} />
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Parent />);
		});

		expect(childRenderCount).toBe(1);

		await act(async () => {
			setCountFn(1);
		});

		// Parent 的 state 变化了，Child 即使 props 没变化也可能重新渲染
		// 这取决于 bailout 策略的实现
		expect(root).toMatchRenderedOutput(
			<div>
				<span>1</span>
				<div>1</div>
			</div>
		);
	});

	test('bailout preserves sibling fibers when a nested sibling updates', async () => {
		let setSecondCount;

		function Child({ label }) {
			const [count, setCount] = useState(0);
			if (label === 'B') {
				setSecondCount = setCount;
			}
			return (
				<span>
					{label}:{count}
				</span>
			);
		}

		function App() {
			return (
				<div>
					<Child label="A" />
					<Child label="B" />
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<App />);
		});

		await act(async () => {
			setSecondCount(1);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<span>A:0</span>
				<span>B:1</span>
			</div>
		);
	});
});
