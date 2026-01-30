/* eslint-disable react/prop-types */
'use strict';

let React;
let ReactNoop;
let act;
let useContext;
let createContext;
let useState;
let memo;

describe('Context', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useContext = React.useContext;
		createContext = React.createContext;
		useState = React.useState;
		memo = React.memo;
	});

	test('Context provides and consumes value', async () => {
		const ThemeContext = createContext('light');

		function ThemeProvider({ children, value }) {
			return (
				<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
			);
		}

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			return <button>{theme}</button>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<ThemeProvider value="dark">
					<ThemedButton />
				</ThemeProvider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>dark</button>);
	});

	test('Context uses default value when no Provider', async () => {
		const ThemeContext = createContext('light');

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			return <button>{theme}</button>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<ThemedButton />);
		});

		expect(root).toMatchRenderedOutput(<button>light</button>);
	});

	test('Context updates when Provider value changes', async () => {
		const ThemeContext = createContext('light');

		function ThemeProvider({ children, value }) {
			return (
				<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
			);
		}

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			return <button>{theme}</button>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<ThemeProvider value="dark">
					<ThemedButton />
				</ThemeProvider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>dark</button>);

		await act(async () => {
			root.render(
				<ThemeProvider value="light">
					<ThemedButton />
				</ThemeProvider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>light</button>);
	});

	test('nested Context Providers work correctly', async () => {
		const ThemeContext = createContext('light');
		const LanguageContext = createContext('en');

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			const lang = useContext(LanguageContext);
			return (
				<button>
					{theme}-{lang}
				</button>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<ThemeContext.Provider value="dark">
					<LanguageContext.Provider value="zh">
						<ThemedButton />
					</LanguageContext.Provider>
				</ThemeContext.Provider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>dark-zh</button>);
	});

	test('nested Providers of the same Context restore the outer value', async () => {
		// 内层 Provider 出栈后，其后的兄弟节点必须读回外层的值（popProvider）
		const ThemeContext = createContext('default');

		function Read({ label }) {
			const value = useContext(ThemeContext);
			return (
				<span>
					{label}:{value}
				</span>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<ThemeContext.Provider value="outer">
					<ThemeContext.Provider value="inner">
						<Read label="inside" />
					</ThemeContext.Provider>
					<Read label="after" />
				</ThemeContext.Provider>
			);
		});

		expect(root).toMatchRenderedOutput(
			<>
				<span>inside:inner</span>
				<span>after:outer</span>
			</>
		);
	});

	test('context change reaches consumers behind a bailed-out memo boundary', async () => {
		// Middle 不接收任何 props，浅比较相等而命中 bailout，
		// 深处的 Leaf 只能靠 propagateContextChange 被标记更新
		const ValueContext = createContext(0);
		let setValue;
		let middleRenderCount = 0;
		let leafRenderCount = 0;

		function Leaf() {
			leafRenderCount++;
			const value = useContext(ValueContext);
			return <div>{value}</div>;
		}

		const Middle = memo(function Middle() {
			middleRenderCount++;
			return <Leaf />;
		});

		function App() {
			const [value, updateValue] = useState(0);
			setValue = updateValue;
			return (
				<ValueContext.Provider value={value}>
					<Middle />
				</ValueContext.Provider>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<App />);
		});

		expect(root).toMatchRenderedOutput(<div>0</div>);

		await act(async () => {
			setValue(7);
		});

		expect(middleRenderCount).toBe(1);
		expect(leafRenderCount).toBe(2);
		expect(root).toMatchRenderedOutput(<div>7</div>);
	});
});
