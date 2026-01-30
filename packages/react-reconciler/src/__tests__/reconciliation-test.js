/* eslint-disable react/prop-types */
'use strict';

// JSX here is compiled to `React.createElement` (classic runtime),
// so React must be in scope.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let React;
let ReactNoop;
let act;

describe('Reconciliation', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
	});

	test('reuses fiber when key and type match', async () => {
		function Item({ value }) {
			return <div>{value}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<div>
					<Item key="a" value={1} />
					<Item key="b" value={2} />
				</div>
			);
		});

		await act(async () => {
			root.render(
				<div>
					<Item key="a" value={3} />
					<Item key="b" value={4} />
				</div>
			);
		});

		expect(root).toMatchRenderedOutput(
			<div>
				<div>3</div>
				<div>4</div>
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

	test('handles Fragment correctly', async () => {
		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<>
					<div>1</div>
					<div>2</div>
				</>
			);
		});

		expect(root).toMatchRenderedOutput(
			<>
				<div>1</div>
				<div>2</div>
			</>
		);
	});
});
