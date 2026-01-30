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
});
