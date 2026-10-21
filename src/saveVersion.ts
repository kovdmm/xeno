// The version of what the game keeps in the player's browser, and what a release does to old saves.
// One small file, edited by hand by whoever makes the release (README: "Releases: resetting saves and seasons").
//
//   version  the schema of the saves. Bump it when this release must reset what players kept; a release that
//            keeps the saves leaves it as it is. A browser without a stored version counts as version 0.
//   reset    what the bump does to a browser that has an older (or no) version:
//              "all"       every xt-* key goes except the player's name: progress, records, settings, flags
//              "progress"  progress, wins, records and the tutorial flags go; the settings stay
//              "none"      nothing is removed, the new version is just written
//
// The policy of THIS release is the pair below. The next release that changes the balance in a way that makes old
// progress meaningless (map lengths, unlock thresholds) bumps `version` and chooses `reset` again.
export const SAVE: { version: number; reset: "all" | "progress" | "none" } = {
  version: 1,
  // the first release with a version: players kept old saves of the previous release, and the tutorial is new
  reset: "all",
};
