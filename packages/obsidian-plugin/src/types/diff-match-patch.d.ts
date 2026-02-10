declare module "diff-match-patch" {
	class diff_match_patch {
		Match_Threshold: number;
		Match_Distance: number;
		Patch_DeleteThreshold: number;
		patch_fromText(text: string): unknown[];
		patch_make(text1: string, text2?: string, diffs?: unknown): unknown[];
		patch_apply(patches: unknown[], text: string): [string, boolean[]];
	}
	export default diff_match_patch;
	export { diff_match_patch };
}
