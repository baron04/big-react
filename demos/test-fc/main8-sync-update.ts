import './style.css';
const button = document.createElement('button');
button.innerText = 'Button';
const root = document.querySelector('#root')!;
root.appendChild(button);

interface Work {
	count: number;
}

const workList: Work[] = [];

button.onclick = () => {
	workList.unshift({
		count: 100000
	});
	schedule();
};

function schedule() {
	const currentWork = workList.pop();
	if (currentWork) {
		perform(currentWork);
	}
}

function perform(work: Work) {
	while (work.count) {
		work.count--;
		insertSpan('0');
	}
	schedule();
}

function insertSpan(content: string) {
	const span = document.createElement('span');
	span.innerText = content;
	root.append(span);
}
