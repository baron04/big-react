/* eslint-disable react/prop-types */
'use strict';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let React;
let ReactDOMClient;
let act;
let Scheduler;

describe('SyntheticEvent', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactDOMClient = require('react-dom/client');
		act = require('jest-react').act;
		Scheduler = require('scheduler');
	});

	test('capture and bubble handlers fire in correct order', async () => {
		const logs = [];

		function App() {
			return (
				<div
					onClickCapture={() => logs.push('div capture')}
					onClick={() => logs.push('div bubble')}
				>
					<button
						onClickCapture={() => logs.push('button capture')}
						onClick={() => logs.push('button bubble')}
					>
						Click
					</button>
				</div>
			);
		}

		const container = document.createElement('div');
		const root = ReactDOMClient.createRoot(container);
		await act(async () => {
			root.render(<App />);
		});

		const button = container.querySelector('button');
		expect(button).not.toBeNull();

		await act(async () => {
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});

		expect(logs).toEqual([
			'div capture',
			'button capture',
			'button bubble',
			'div bubble'
		]);
	});

	test('stopPropagation in capture prevents bubble', async () => {
		const logs = [];

		function App() {
			return (
				<div
					onClickCapture={() => logs.push('div capture')}
					onClick={() => logs.push('div bubble')}
				>
					<button
						onClickCapture={(e) => {
							logs.push('button capture');
							e.stopPropagation();
						}}
						onClick={() => logs.push('button bubble')}
					>
						Click
					</button>
				</div>
			);
		}

		const container = document.createElement('div');
		const root = ReactDOMClient.createRoot(container);
		await act(async () => {
			root.render(<App />);
		});

		const button = container.querySelector('button');
		expect(button).not.toBeNull();

		await act(async () => {
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});

		expect(logs).toEqual(['div capture', 'button capture']);
	});

	test('event handlers run with Immediate priority for click', async () => {
		const seen = [];

		function App() {
			return (
				<button
					onClick={() => {
						seen.push(Scheduler.unstable_getCurrentPriorityLevel());
					}}
				>
					Click
				</button>
			);
		}

		const container = document.createElement('div');
		const root = ReactDOMClient.createRoot(container);
		await act(async () => {
			root.render(<App />);
		});

		const button = container.querySelector('button');
		expect(button).not.toBeNull();

		await act(async () => {
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});

		expect(seen).toEqual([Scheduler.unstable_ImmediatePriority]);
	});

	test('updating props updates event handlers (no duplicate listeners)', async () => {
		const logs = [];

		function App({ onClick }) {
			return <button onClick={onClick}>Click</button>;
		}

		const container = document.createElement('div');
		const root = ReactDOMClient.createRoot(container);

		await act(async () => {
			root.render(<App onClick={() => logs.push('first')} />);
		});

		await act(async () => {
			root.render(<App onClick={() => logs.push('second')} />);
		});

		const button = container.querySelector('button');
		expect(button).not.toBeNull();

		await act(async () => {
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});

		expect(logs).toEqual(['second']);
	});

	test('style updates remove properties that no longer exist', async () => {
		function App({ style }) {
			return <div style={style}>Box</div>;
		}

		const container = document.createElement('div');
		const root = ReactDOMClient.createRoot(container);

		await act(async () => {
			root.render(<App style={{ color: 'red', display: 'block' }} />);
		});

		const div = container.querySelector('div');
		expect(div.style.color).toBe('red');
		expect(div.style.display).toBe('block');

		await act(async () => {
			root.render(<App style={{ color: 'blue' }} />);
		});

		expect(div.style.color).toBe('blue');
		expect(div.style.display).toBe('');
	});

	test('initEvent registers DOM listener only once per container', async () => {
		const container = document.createElement('div');
		const addSpy = jest.spyOn(container, 'addEventListener');

		function App({ onClick }) {
			return <button onClick={onClick}>Click</button>;
		}

		const root = ReactDOMClient.createRoot(container);
		await act(async () => {
			root.render(<App onClick={() => {}} />);
		});
		await act(async () => {
			root.render(<App onClick={() => {}} />);
		});
		await act(async () => {
			root.render(<App onClick={() => {}} />);
		});

		const clickAdds = addSpy.mock.calls.filter((c) => c[0] === 'click');
		expect(clickAdds.length).toBe(1);
	});
});
