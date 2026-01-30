'use strict';

let React;
let ReactNoop;
let act;
let useState;

describe('useState', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useState = React.useState;
	});

	test('basic useState works', async () => {
		function Component() {
			const [count, setCount] = useState(0);
			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(<div>0</div>);
	});

	test('setState updates state', async () => {
		let setCountFn;
		function Component() {
			const [count, setCount] = useState(0);
			setCountFn = setCount;
			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(<div>0</div>);

		await act(async () => {
			setCountFn(1);
		});

		expect(root).toMatchRenderedOutput(<div>1</div>);
	});

	test('functional setState updates state correctly', async () => {
		let setCountFn;
		function Component() {
			const [count, setCount] = useState(0);
			setCountFn = setCount;
			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(<div>0</div>);

		await act(async () => {
			setCountFn((c) => c + 1);
		});

		expect(root).toMatchRenderedOutput(<div>1</div>);
	});

	test('multiple setState calls in one event are batched', async () => {
		let setCountFn;
		function Component() {
			const [count, setCount] = useState(0);
			setCountFn = setCount;
			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(<div>0</div>);

		await act(async () => {
			// 在同一事件循环中调用多次 setState
			setCountFn((c) => c + 1);
			setCountFn((c) => c + 2);
			setCountFn((c) => c + 3);
		});

		// 应该只渲染一次，结果是 0+1+2+3=6
		expect(root).toMatchRenderedOutput(<div>6</div>);
	});

	test('mixed functional and direct setState', async () => {
		let setCountFn;
		function Component() {
			const [count, setCount] = useState(0);
			setCountFn = setCount;
			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		await act(async () => {
			setCountFn((c) => c + 1);
			setCountFn(5);
			setCountFn((c) => c + 10);
		});

		// 正确结果: 0+1=1, 然后设置为 5, 然后 5+10=15
		expect(root).toMatchRenderedOutput(<div>15</div>);
	});

	test('setState with same value does not trigger re-render', async () => {
		let renderCount = 0;
		let setCountFn;
		function Component() {
			renderCount++;
			const [count, setCount] = useState(0);
			setCountFn = setCount;
			return <div>{count}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(renderCount).toBe(1);

		await act(async () => {
			setCountFn(0);
		});

		// eagerState 命中时，不应该触发重新渲染/调度
		expect(renderCount).toBe(1);
		expect(root).toMatchRenderedOutput(<div>0</div>);
	});

	test('multiple useState hooks work independently', async () => {
		let setCount1Fn, setCount2Fn;
		function Component() {
			const [count1, setCount1] = useState(0);
			const [count2, setCount2] = useState(10);
			setCount1Fn = setCount1;
			setCount2Fn = setCount2;
			return (
				<div>
					<span>{count1}</span>
					<span>{count2}</span>
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<span>0</span>
				<span>10</span>
			</div>
		);

		await act(async () => {
			setCount1Fn(1);
			setCount2Fn(9);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<span>1</span>
				<span>9</span>
			</div>
		);
	});
});
