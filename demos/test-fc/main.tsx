import * as React from 'react';
// import { useState } from 'react';
// import { createRoot } from 'react-dom/client';

// import ReactDOM from 'react-dom';
// console.log(ReactDOM);

console.log(import.meta.hot);

const jsx = (
	<div>
		<span>big react</span>
	</div>
);

console.log(React);
console.log(jsx);

// function Child() {
// 	const [num, setNum] = useState(100);
// 	window.setNum = setNum;

// 	const arr =
// 		num % 2 == 0
// 			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
// 			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
// 	return (
// 		<div>
// 			{/* {num == 3 ? (
// 				<div>{jsx}</div>
// 			) : (
// 				<span onClickCapture={() => setNum(num + 1)}>{num}</span>
// 			)} */}
// 			{/* <span onClick={() => setNum(num + 1)}>{num}</span> */}

// 			<span
// 				onClick={() => {
// 					setNum((num) => num + 1);
// 					setNum((num) => num + 1);
// 					setNum((num) => num + 1);
// 				}}
// 			>
// 				{num}
// 			</span>
// 			<ul>{arr}</ul>
// 		</div>
// 	);
// }

// const fragmentTest1 = (
// 	<>
// 		<div></div>
// 		<div></div>
// 	</>
// );

// const fragmentTest2 = (
// 	<ul>
// 		<>
// 			<li>1</li>
// 			<li>2</li>
// 		</>
// 		<li>3</li>
// 		<li>4</li>
// 	</ul>
// );

// function App() {
// 	return (
// 		<div>
// 			<Child />
// 			{/* {fragmentTest2} */}
// 		</div>
// 	);
// }



// createRoot(document.getElementById('root')).render(<App />);
