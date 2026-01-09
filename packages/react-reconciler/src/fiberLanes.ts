export type Lane = number;
export type Lanes = number;

export const NoLane = 0b0000;
export const NoLanes = 0b0000;
export const SyncLane = 0b0001;

export function mergeLane(laneA: Lane, laneB: Lane) {
	return laneA | laneB;
}

export function requestUpdateLane() {
	return SyncLane;
}
