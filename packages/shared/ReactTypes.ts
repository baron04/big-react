export type Type = any;
export type Key = string | number;
export type Ref = null | { current: any } | ((instance: any) => void);
export type Props = {
	[key: string]: any;
	children?: any;
};
export type ElementKey = any;

export interface ReactElement {
	$$typeof: symbol | number;
	type: ElementKey;
	key: Key | null;
	ref: Ref;
	props: Props;
	__mark: string;
}

export type Action<State> = State | ((prevState: State) => State);

export type ReactNode =
	| ReactElement
	| string
	| number
	| boolean
	| null
	| undefined;

export type ReactContext<T> = {
	$$typeof: symbol | number;
	Provider: ReactProviderType<T> | null;
	_currentValue: T;
};

export type ReactProviderType<T> = {
	$$typeof: symbol | number;
	_context: ReactContext<T> | null;
};

export type Usable<T> = Thenable<T> | ReactContext<T>;

export interface Wakeable<Result> {
	then(
		onFulfilled: () => Result,
		onRejected: () => Result
	): void | Wakeable<Result>;
}

interface ThenableImpl<T, Result, Err> {
	then(
		onFulfilled: (value: T) => Result,
		onRejected: (error: Err) => Result
	): void | Wakeable<Result>;
}

export interface UntrackedThenable<T, Result, Err> extends ThenableImpl<
	T,
	Result,
	Err
> {
	status?: void;
}

export interface PendingThenable<T, Result, Err> extends ThenableImpl<
	T,
	Result,
	Err
> {
	status: 'pending';
}

export interface FulfilledThenable<T, Result, Err> extends ThenableImpl<
	T,
	Result,
	Err
> {
	status: 'fulfilled';
	value: T;
}

export interface RejectedThenable<T, Result, Err> extends ThenableImpl<
	T,
	Result,
	Err
> {
	status: 'rejected';
	reason: Err;
}

// 4种状态：untracked pending fulfilled rejected
export type Thenable<T, Result = void, Err = any> =
	| UntrackedThenable<T, Result, Err>
	| PendingThenable<T, Result, Err>
	| FulfilledThenable<T, Result, Err>
	| RejectedThenable<T, Result, Err>;
