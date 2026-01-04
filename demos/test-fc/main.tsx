import * as React from 'react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// import ReactDOM from 'react-dom';
// console.log(ReactDOM);

// console.log(import.meta.hot);

function Child() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;

	return (
		<div>
			<span
			// onClick={() => {
			// 	setNum((num) => num + 1);
			// 	setNum((num) => num + 1);
			// 	setNum((num) => num + 1);
			// }}
			>
				{num}
			</span>
			{/* <ul>{arr}</ul> */}
		</div>
	);
}

function App() {
	return (
		<div>
			<Child />
		</div>
	);
}

createRoot(document.getElementById('root')!).render(<App />);
