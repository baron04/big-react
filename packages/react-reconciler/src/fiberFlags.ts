export type Flags = number;

export const NoFlags = 0b0000000;
export const Placement = 0b0000001;
export const Update = 0b0000010;
export const ChildDeletion = 0b0000100;

// useEffect
export const PassiveEffect = 0b0001000;
export const Ref = 0b0010000;
export const Visibility = 0b0100000;

export const MutationMask =
	Placement | Update | ChildDeletion | Ref | Visibility;
export const LayoutMask = Ref;

// 删除子节点可能触发 useEffect destroy
export const PassiveMask = PassiveEffect | ChildDeletion;
