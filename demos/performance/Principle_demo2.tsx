import { useState } from 'react';

export default function App() {
	console.log('App render ');

	return (
		<div>
			<Num />
			<ExpensiveSubtree />
		</div>
	);
}

function Num() {
	const [num, update] = useState(0);

	return (
		<>
			<button
				onClick={(e) => {
					e.stopPropagation();
					update(num + 1);
				}}
			>
				+ 1
			</button>
			<p>num is: {num}</p>
		</>
	);
}

function ExpensiveSubtree() {
	console.log('ExpensiveSubtree render');
	return <p>i am child</p>;
}
