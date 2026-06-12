/* eslint-disable react/prop-types */
'use strict';

let React;
let ReactNoop;
let act;
let useRef;

describe('Ref', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useRef = React.useRef;
	});

	test('useRef persists value across renders', async () => {
		const refs = [];

		function Component() {
			const ref = useRef(0);
			refs.push(ref);
			return <div>{ref.current}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(refs[0].current).toBe(0);

		await act(async () => {
			refs[0].current = 1;
			root.render(<Component />);
		});

		// ref 应该保持相同的引用
		expect(refs[0]).toBe(refs[1]);
		expect(refs[1].current).toBe(1);
	});

	test('ref.current can be mutated', async () => {
		let ref;
		function Component() {
			ref = useRef(0);
			return <div>{ref.current}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(ref.current).toBe(0);

		ref.current = 10;

		await act(async () => {
			root.render(<Component />);
		});

		// ref.current 的修改应该保持
		expect(ref.current).toBe(10);
	});

	test('host ref is detached before a new ref is attached', async () => {
		const firstRef = { current: null };
		const secondRef = { current: null };

		function Component({ hostRef }) {
			return <div ref={hostRef}>Hello</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component hostRef={firstRef} />);
		});

		expect(firstRef.current).not.toBe(null);
		expect(secondRef.current).toBe(null);

		await act(async () => {
			root.render(<Component hostRef={secondRef} />);
		});

		expect(firstRef.current).toBe(null);
		expect(secondRef.current).not.toBe(null);
	});
});
