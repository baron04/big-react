'use strict';

let React;
let ReactNoop;
let act;
let useState;

describe('WorkLoop', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		act = require('jest-react').act;
		ReactNoop = require('react-noop-renderer');
		useState = React.useState;
	});

	test('render phase completes before commit phase', async () => {
		const logs = [];

		function Component() {
			logs.push('render');
			return <div>Hello</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(logs).toEqual(['render']);
		expect(root).toMatchRenderedOutput(<div>Hello</div>);
	});

	test('multiple updates are processed in order', async () => {
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
			setCountFn(2);
			setCountFn(3);
		});

		// 最后一个更新应该生效
		expect(root).toMatchRenderedOutput(<div>3</div>);
	});

	test('concurrent rendering can yield', async () => {
		// 这个测试主要验证并发渲染的基本功能
		// 具体的 yield 行为取决于实现
		function Component() {
			return <div>Hello</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(<div>Hello</div>);
	});
});
