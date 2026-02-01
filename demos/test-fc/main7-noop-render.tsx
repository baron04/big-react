import ReactNoopRenderer from 'react-noop-renderer';
// import { createRoot } from 'react-noop-renderer';

function Child() {
	return 'Child';
}

function App() {
	return (
		<>
			<div>hello world</div>
			<Child />
		</>
	);
}

const root = ReactNoopRenderer.createRoot();
root.render(<App />);
// @ts-ignore
window.root = root;
// 在浏览器控制台打印 root.getChildren()
