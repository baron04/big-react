import { ReactContext } from 'shared/ReactTypes';

let prevContextValue: any = null;
const prevContextValueStack: unknown[] = [];

function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	prevContextValueStack.push(prevContextValue);
	prevContextValue = context._currentValue;
	context._currentValue = newValue;
}

function popProvider<T>(context: ReactContext<T>) {
	context._currentValue = /* 上一个context._currentValue */ prevContextValue;
	prevContextValue = prevContextValueStack.pop();
}
