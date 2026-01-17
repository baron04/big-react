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
