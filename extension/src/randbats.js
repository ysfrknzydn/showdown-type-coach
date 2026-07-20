// Random-Battle-specific stat estimation, no DOM/browser dependency. Loaded
// after typechart.js and statmath.js.
//
// Unlike statmath.js (which stays generic - "could be any constructed team,"
// wide range), this file encodes an evidence-based fact specific to Pokemon
// Showdown's Random Battle generator: sets are NOT arbitrary. Every stat
// defaults to a near-fixed spread (31 IV / 84 EV / neutral nature), with two
// detectable exceptions (Trick Room/Gyro Ball users get dumped Speed
// instead; a Pokemon with no known physical move likely has dumped Attack).
// This lets Random Battle specifically get a much tighter stat ESTIMATE than
// the wide min/max range statmath.js uses for arbitrary constructed teams.
//
// Source for these specific numbers/exceptions: read directly from
// Nebraskinator/ps-ppo's obs_pokemon.py (a reference Random Battle bot),
// not guessed. Kept in its own file, separate from statmath.js, so these
// evidence-gated assumptions are easy to isolate or revise later if the
// reference numbers turn out stale for the current generation.
//
// As always: an unrevealed ability/item never changes the primary estimate
// (`est`), only widens the `max` safety margin - "only revealed info"
// applies here exactly as it does everywhere else in this extension.
(function () {
	var SM = window.PSHelper.StatMath;

	var DEFAULT_IV = 31, DEFAULT_EV = 84;
	var HINDER_IV = 0, HINDER_EV = 0, HINDER_NATURE = 0.9;
	var NEUTRAL_NATURE = 1.0;

	// Moves that don't scale off the user's OWN Attack stat - don't count as
	// "evidence of a physical set" even though they're physical-category.
	var ATK_INDEPENDENT_PHYSICAL = { foulplay: 1, bodypress: 1, rapidspin: 1 };
	var SLOW_EVIDENCE_MOVES = { trickroom: 1, gyroball: 1 };

	var SPEED_ITEM_MULT = { choicescarf: 1.5 };
	var SPEED_ABILITY_MULT = { swiftswim: 2, chlorophyll: 2, sandrush: 2, slushrush: 2, surgesurfer: 2, unburden: 2 };
	var ATK_ITEM_MULT = { choiceband: 1.5, thickclub: 1.5, lightball: 1.5 };
	var ATK_ABILITY_MULT = { hugepower: 2, purepower: 2 };
	var SPA_ITEM_MULT = { choicespecs: 1.5, lightball: 1.5 };
	var SPD_ITEM_MULT = { assaultvest: 1.5, eviolite: 1.5 };
	var DEF_ITEM_MULT = { eviolite: 1.5 };
	var DEF_ABILITY_MULT = { furcoat: 2 };
	// Deliberately excluded: Filter/Solid Rock/Prism Armor/Thick Fat and similar
	// flat damage-reducing abilities - those change damage MAGNITUDE, not a
	// Pokemon's actual stat, and typechart.js's ABILITY_IMMUNITY table made the
	// same "out of scope for this heuristic" call for the same reason.

	function normalizeId(str) {
		return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
	}

	function hasEvidence(moves, table) {
		return (moves || []).some(function (m) {
			return m && m.id && table[m.id];
		});
	}

	function hasKnownPhysicalMove(moves) {
		return (moves || []).some(function (m) {
			return m && m.category === "Physical" && !ATK_INDEPENDENT_PHYSICAL[m.id];
		});
	}

	// mult: only applied when ability/item is genuinely revealed (never a guess).
	// maxMult: widens to the larger of "could have a boosting item" or "could
	// have a boosting ability" while unrevealed - NOT their product. A Pokemon
	// realistically has one boosting source or the other, essentially never
	// both; multiplying both ceilings together (e.g. 1.5x item * 2x ability)
	// produces an unrealistic worst case that would make almost every
	// not-yet-revealed Pokemon look like a guaranteed OHKO threat.
	function statMultiplier(ability, item, itemTable, abilityTable) {
		var abilityId = normalizeId(ability);
		var itemId = normalizeId(item);
		var mult = 1;
		var itemCeiling = 1;
		var abilityCeiling = 1;

		if (item) {
			if (itemTable[itemId]) mult *= itemTable[itemId];
		} else {
			for (var k in itemTable) if (itemTable[k] > itemCeiling) itemCeiling = itemTable[k];
		}
		if (abilityTable) {
			if (ability) {
				if (abilityTable[abilityId]) mult *= abilityTable[abilityId];
			} else {
				for (var a in abilityTable) if (abilityTable[a] > abilityCeiling) abilityCeiling = abilityTable[a];
			}
		}
		var maxMult = Math.max(mult, itemCeiling, abilityCeiling);
		return { mult: mult, maxMult: maxMult };
	}

	function applyMultTriple(triple, multResult) {
		return {
			min: Math.floor(triple.min * multResult.mult),
			est: Math.floor(triple.est * multResult.mult),
			max: Math.floor(triple.max * multResult.maxMult)
		};
	}

	function estimateAllStats(pokemon) {
		if (!pokemon || !pokemon.baseStats) return null;
		var base = pokemon.baseStats;
		var level = pokemon.level || 100;
		var moves = pokemon.moves || [];

		var hpVal = SM.rawHP(base.hp || 0, level, DEFAULT_IV, DEFAULT_EV);
		var hp = { min: hpVal, est: hpVal, max: hpVal };

		var atkDefault = SM.rawStat(base.atk || 0, level, DEFAULT_IV, DEFAULT_EV, NEUTRAL_NATURE);
		var atkDumped = SM.rawStat(base.atk || 0, level, 0, 0, NEUTRAL_NATURE);
		var atk;
		if (hasKnownPhysicalMove(moves)) {
			atk = { min: atkDefault, est: atkDefault, max: atkDefault };
		} else {
			// No physical move seen yet: likely dumped, but a physical move could
			// still be revealed later, so keep the ceiling open.
			atk = { min: atkDumped, est: atkDumped, max: atkDefault };
		}
		atk = applyMultTriple(atk, statMultiplier(pokemon.ability, pokemon.item, ATK_ITEM_MULT, ATK_ABILITY_MULT));

		var defVal = SM.rawStat(base.def || 0, level, DEFAULT_IV, DEFAULT_EV, NEUTRAL_NATURE);
		var def = applyMultTriple(
			{ min: defVal, est: defVal, max: defVal },
			statMultiplier(pokemon.ability, pokemon.item, DEF_ITEM_MULT, DEF_ABILITY_MULT)
		);

		var spaVal = SM.rawStat(base.spa || 0, level, DEFAULT_IV, DEFAULT_EV, NEUTRAL_NATURE);
		var spa = applyMultTriple(
			{ min: spaVal, est: spaVal, max: spaVal },
			statMultiplier(pokemon.ability, pokemon.item, SPA_ITEM_MULT, null)
		);

		var spdVal = SM.rawStat(base.spd || 0, level, DEFAULT_IV, DEFAULT_EV, NEUTRAL_NATURE);
		var spd = applyMultTriple(
			{ min: spdVal, est: spdVal, max: spdVal },
			statMultiplier(pokemon.ability, pokemon.item, SPD_ITEM_MULT, null)
		);

		var speDefault = SM.rawStat(base.spe || 0, level, DEFAULT_IV, DEFAULT_EV, NEUTRAL_NATURE);
		var speVal;
		if (hasEvidence(moves, SLOW_EVIDENCE_MOVES)) {
			speVal = SM.rawStat(base.spe || 0, level, HINDER_IV, HINDER_EV, HINDER_NATURE);
		} else {
			speVal = speDefault;
		}
		var spe = applyMultTriple(
			{ min: speVal, est: speVal, max: speVal },
			statMultiplier(pokemon.ability, pokemon.item, SPEED_ITEM_MULT, SPEED_ABILITY_MULT)
		);

		return { hp: hp, atk: atk, def: def, spa: spa, spd: spd, spe: spe };
	}

	window.PSHelper = window.PSHelper || {};
	window.PSHelper.RandBats = {
		estimateAllStats: estimateAllStats,
		statMultiplier: statMultiplier
	};
})();
