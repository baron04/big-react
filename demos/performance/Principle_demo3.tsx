import { useState } from 'react';

// export default function App() {
// 	const [num, setNum] = useState(0);
// 	console.log('App render ', num);

// 	return (
// 		<div title={String(num)}>
// 			<button onClick={() => setNum(num + 1)}>+ 1</button>
// 			<p>num is: {num}</p>
// 			<ExpensiveSubtree />
// 		</div>
// 	);
// }

export default function App() {
	console.log('App render ');

	return (
		<Wrapper>
			<ExpensiveSubtree />
		</Wrapper>
	);
}

function Wrapper({ children }: any) {
	const [num, setNum] = useState(0);

	return (
		<div title={String(num)}>
			<button onClick={() => setNum(num + 1)}>+ 1</button>
			<p>num is: {num}</p>
			{children}
		</div>
	);
}

function ExpensiveSubtree() {
	console.log('ExpensiveSubtree render');
	return <p>i am child</p>;
}
