export type Flags = number;

export const NoFlags = 0b00000000;
export const Placement = 0b00000001;
export const Update = 0b00000010;
export const ChildDeletion = 0b00000100;

// useEffect
export const PassiveEffect = 0b00001000;
export const Ref = 0b00010000;
export const Visibility = 0b00100000;
export const DidCapture = 0b01000000;

// render 阶段 捕获到一些东西
export const ShouldCapture = 0b10000000;

export const MutationMask =
	Placement | Update | ChildDeletion | Ref | Visibility;
export const LayoutMask = Ref;

// 删除子节点可能触发 useEffect destroy
export const PassiveMask = PassiveEffect | ChildDeletion;
