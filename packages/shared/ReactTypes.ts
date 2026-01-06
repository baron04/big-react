export type Type = any;
export type Key = any;
export type Ref = any;
export type Props = {
	[key: string]: any;
	children?: any;
};
export type ElementKey = any;

export interface ReactElement {
	$$typeof: symbol | number;
	type: ElementKey;
	key: Key;
	ref: Ref;
	props: Props;
	__mark: string;
}

export type Action<State> = State | ((prevState: State) => State);
