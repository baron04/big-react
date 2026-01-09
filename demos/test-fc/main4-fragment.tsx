import * as React from 'react';
import { createRoot } from 'react-dom/client';

function App1() {
	return (
		<>
			<div>1</div>
			<div>2</div>
		</>
	);
}

function App2() {
	return (
		<ul>
			<>
				<li>1</li>
				<li>2</li>
			</>
			<li>3</li>
			<li>4</li>
		</ul>
	);
}

function App3() {
	const [num, setNum] = React.useState(1);

	const arr =
		num % 2 === 0
			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];

	return (
		<ul
			onClickCapture={() => {
				setNum(num + 1);
			}}
		>
			<li>A</li>
			<li>B</li>
			{arr}
		</ul>
	);
}

createRoot(document.getElementById('root')!).render(<App3 />);
