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
