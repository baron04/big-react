/* eslint-disable react/prop-types */
'use strict';

// JSX here is compiled to `React.createElement` (classic runtime),
// so React must be in scope.
let React;
let ReactNoop;
let act;
let useState;

describe('Reconciliation', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useState = React.useState;
	});

	test('reuses fiber when key and type match', async () => {
		// state 能跨越 props 变更存活，才说明 fiber 被复用而非销毁重建
		const setters = {};

		function Item({ itemKey, value }) {
			const [extra, setExtra] = useState(0);
			setters[itemKey] = setExtra;
			return (
				<div>
					{value}-{extra}
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<div>
					<Item key="a" itemKey="a" value={1} />
					<Item key="b" itemKey="b" value={2} />
				</div>
			);
		});

		await act(async () => {
			setters.a(100);
		});

		await act(async () => {
			root.render(
				<div>
					<Item key="a" itemKey="a" value={3} />
					<Item key="b" itemKey="b" value={4} />
				</div>
			);
		});

		// a 的 state 100 存活下来，证明 fiber 被复用而非重建
		expect(root).toMatchRenderedOutput(
			<div>
				<div>3-100</div>
				<div>4-0</div>
			</div>
		);
	});

	test('reorder still applies after a child state update', async () => {
		// 回归用例：父级走 bailout 复用子 fiber 时，若 index 未随之复制，
		// 下一次 diff 会漏打 Placement 标记，重排静默失效（顺序停在 a,b,c）
		const setters = {};

		function Item({ itemKey }) {
			const [count, setCount] = useState(0);
			setters[itemKey] = setCount;
			return (
				<div>
					{itemKey}:{count}
				</div>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<div>
					<Item key="a" itemKey="a" />
					<Item key="b" itemKey="b" />
					<Item key="c" itemKey="c" />
				</div>
			);
		});

		// 只有 c 有更新，父 div 与其余兄弟走 bailout
		await act(async () => {
			setters.c(9);
		});

		await act(async () => {
			root.render(
				<div>
					<Item key="c" itemKey="c" />
					<Item key="a" itemKey="a" />
					<Item key="b" itemKey="b" />
				</div>
			);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<div>c:9</div>
				<div>a:0</div>
				<div>b:0</div>
			</div>
		);
	});

	test('reorders items correctly', async () => {
		function Item({ value }) {
			return <div>{value}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<div>
					<Item key="a" value={1} />
					<Item key="b" value={2} />
					<Item key="c" value={3} />
				</div>
			);
		});

		await act(async () => {
			root.render(
				<div>
					<Item key="c" value={3} />
					<Item key="a" value={1} />
					<Item key="b" value={2} />
				</div>
			);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<div>3</div>
				<div>1</div>
				<div>2</div>
			</div>
		);
	});

	test('removes items correctly', async () => {
		function Item({ value }) {
			return <div>{value}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<div>
					<Item key="a" value={1} />
					<Item key="b" value={2} />
					<Item key="c" value={3} />
				</div>
			);
		});

		await act(async () => {
			root.render(
				<div>
					<Item key="a" value={1} />
					<Item key="c" value={3} />
				</div>
			);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<div>1</div>
				<div>3</div>
			</div>
		);
	});

	test('adds items correctly', async () => {
		function Item({ value }) {
			return <div>{value}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<div>
					<Item key="a" value={1} />
					<Item key="c" value={3} />
				</div>
			);
		});

		await act(async () => {
			root.render(
				<div>
					<Item key="a" value={1} />
					<Item key="b" value={2} />
					<Item key="c" value={3} />
				</div>
			);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<div>1</div>
				<div>2</div>
				<div>3</div>
			</div>
		);
	});

	test('handles text nodes correctly', async () => {
		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<div>Hello</div>);
		});

		expect(root).toMatchRenderedOutput(<div>Hello</div>);

		await act(async () => {
			root.render(<div>World</div>);
		});

		expect(root).toMatchRenderedOutput(<div>World</div>);
	});
});
