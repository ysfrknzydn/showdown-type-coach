// Shared data + pure helper functions for type effectiveness.
// Loaded as a plain script before content.js; everything hangs off window.PSHelper.
// Multiplier matrix generated directly from Pokemon Showdown's own
// data/typechart.js (attacker -> defender -> multiplier), so it always
// matches what the actual battle engine uses.
(function () {
	var TYPES = [
		"Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison",
		"Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark",
		"Steel", "Fairy"
	];

	// attacker -> defender -> multiplier (0, 0.5, 1, or 2)
	var CHART = {
		"Bug": {"Bug":1,"Dark":2,"Dragon":1,"Electric":1,"Fairy":0.5,"Fighting":0.5,"Fire":0.5,"Flying":0.5,"Ghost":0.5,"Grass":2,"Ground":1,"Ice":1,"Normal":1,"Poison":0.5,"Psychic":2,"Rock":1,"Steel":0.5,"Stellar":1,"Water":1},
		"Dark": {"Bug":1,"Dark":0.5,"Dragon":1,"Electric":1,"Fairy":0.5,"Fighting":0.5,"Fire":1,"Flying":1,"Ghost":2,"Grass":1,"Ground":1,"Ice":1,"Normal":1,"Poison":1,"Psychic":2,"Rock":1,"Steel":1,"Stellar":1,"Water":1},
		"Dragon": {"Bug":1,"Dark":1,"Dragon":2,"Electric":1,"Fairy":0,"Fighting":1,"Fire":1,"Flying":1,"Ghost":1,"Grass":1,"Ground":1,"Ice":1,"Normal":1,"Poison":1,"Psychic":1,"Rock":1,"Steel":0.5,"Stellar":1,"Water":1},
		"Electric": {"Bug":1,"Dark":1,"Dragon":0.5,"Electric":0.5,"Fairy":1,"Fighting":1,"Fire":1,"Flying":2,"Ghost":1,"Grass":0.5,"Ground":0,"Ice":1,"Normal":1,"Poison":1,"Psychic":1,"Rock":1,"Steel":1,"Stellar":1,"Water":2},
		"Fairy": {"Bug":1,"Dark":2,"Dragon":2,"Electric":1,"Fairy":1,"Fighting":2,"Fire":0.5,"Flying":1,"Ghost":1,"Grass":1,"Ground":1,"Ice":1,"Normal":1,"Poison":0.5,"Psychic":1,"Rock":1,"Steel":0.5,"Stellar":1,"Water":1},
		"Fighting": {"Bug":0.5,"Dark":2,"Dragon":1,"Electric":1,"Fairy":0.5,"Fighting":1,"Fire":1,"Flying":0.5,"Ghost":0,"Grass":1,"Ground":1,"Ice":2,"Normal":2,"Poison":0.5,"Psychic":0.5,"Rock":2,"Steel":2,"Stellar":1,"Water":1},
		"Fire": {"Bug":2,"Dark":1,"Dragon":0.5,"Electric":1,"Fairy":1,"Fighting":1,"Fire":0.5,"Flying":1,"Ghost":1,"Grass":2,"Ground":1,"Ice":2,"Normal":1,"Poison":1,"Psychic":1,"Rock":0.5,"Steel":2,"Stellar":1,"Water":0.5},
		"Flying": {"Bug":2,"Dark":1,"Dragon":1,"Electric":0.5,"Fairy":1,"Fighting":2,"Fire":1,"Flying":1,"Ghost":1,"Grass":2,"Ground":1,"Ice":1,"Normal":1,"Poison":1,"Psychic":1,"Rock":0.5,"Steel":0.5,"Stellar":1,"Water":1},
		"Ghost": {"Bug":1,"Dark":0.5,"Dragon":1,"Electric":1,"Fairy":1,"Fighting":1,"Fire":1,"Flying":1,"Ghost":2,"Grass":1,"Ground":1,"Ice":1,"Normal":0,"Poison":1,"Psychic":2,"Rock":1,"Steel":1,"Stellar":1,"Water":1},
		"Grass": {"Bug":0.5,"Dark":1,"Dragon":0.5,"Electric":1,"Fairy":1,"Fighting":1,"Fire":0.5,"Flying":0.5,"Ghost":1,"Grass":0.5,"Ground":2,"Ice":1,"Normal":1,"Poison":0.5,"Psychic":1,"Rock":2,"Steel":0.5,"Stellar":1,"Water":2},
		"Ground": {"Bug":0.5,"Dark":1,"Dragon":1,"Electric":2,"Fairy":1,"Fighting":1,"Fire":2,"Flying":0,"Ghost":1,"Grass":0.5,"Ground":1,"Ice":1,"Normal":1,"Poison":2,"Psychic":1,"Rock":2,"Steel":2,"Stellar":1,"Water":1},
		"Ice": {"Bug":1,"Dark":1,"Dragon":2,"Electric":1,"Fairy":1,"Fighting":1,"Fire":0.5,"Flying":2,"Ghost":1,"Grass":2,"Ground":2,"Ice":0.5,"Normal":1,"Poison":1,"Psychic":1,"Rock":1,"Steel":0.5,"Stellar":1,"Water":0.5},
		"Normal": {"Bug":1,"Dark":1,"Dragon":1,"Electric":1,"Fairy":1,"Fighting":1,"Fire":1,"Flying":1,"Ghost":0,"Grass":1,"Ground":1,"Ice":1,"Normal":1,"Poison":1,"Psychic":1,"Rock":0.5,"Steel":0.5,"Stellar":1,"Water":1},
		"Poison": {"Bug":1,"Dark":1,"Dragon":1,"Electric":1,"Fairy":2,"Fighting":1,"Fire":1,"Flying":1,"Ghost":0.5,"Grass":2,"Ground":0.5,"Ice":1,"Normal":1,"Poison":0.5,"Psychic":1,"Rock":0.5,"Steel":0,"Stellar":1,"Water":1},
		"Psychic": {"Bug":1,"Dark":0,"Dragon":1,"Electric":1,"Fairy":1,"Fighting":2,"Fire":1,"Flying":1,"Ghost":1,"Grass":1,"Ground":1,"Ice":1,"Normal":1,"Poison":2,"Psychic":0.5,"Rock":1,"Steel":0.5,"Stellar":1,"Water":1},
		"Rock": {"Bug":2,"Dark":1,"Dragon":1,"Electric":1,"Fairy":1,"Fighting":0.5,"Fire":2,"Flying":2,"Ghost":1,"Grass":1,"Ground":0.5,"Ice":2,"Normal":1,"Poison":1,"Psychic":1,"Rock":1,"Steel":0.5,"Stellar":1,"Water":1},
		"Steel": {"Bug":1,"Dark":1,"Dragon":1,"Electric":0.5,"Fairy":2,"Fighting":1,"Fire":0.5,"Flying":1,"Ghost":1,"Grass":1,"Ground":1,"Ice":2,"Normal":1,"Poison":1,"Psychic":1,"Rock":2,"Steel":0.5,"Stellar":1,"Water":0.5},
		"Stellar": {"Bug":1,"Dark":1,"Dragon":1,"Electric":1,"Fairy":1,"Fighting":1,"Fire":1,"Flying":1,"Ghost":1,"Grass":1,"Ground":1,"Ice":1,"Normal":1,"Poison":1,"Psychic":1,"Rock":1,"Steel":1,"Stellar":1,"Water":1},
		"Water": {"Bug":1,"Dark":1,"Dragon":0.5,"Electric":1,"Fairy":1,"Fighting":1,"Fire":2,"Flying":1,"Ghost":1,"Grass":0.5,"Ground":2,"Ice":1,"Normal":1,"Poison":1,"Psychic":1,"Rock":2,"Steel":1,"Stellar":1,"Water":0.5}
	};

	// Conventional type badge colors (the palette most Pokemon fan sites / games use).
	var COLORS = {
		Normal: "#A8A878", Fire: "#F08030", Water: "#6890F0", Electric: "#F8D030",
		Grass: "#78C850", Ice: "#98D8D8", Fighting: "#C03028", Poison: "#A040A0",
		Ground: "#E0C068", Flying: "#A890F0", Psychic: "#F85888", Bug: "#A8B820",
		Rock: "#B8A038", Ghost: "#705898", Dragon: "#7038F8", Dark: "#705848",
		Steel: "#B8B8D0", Fairy: "#EE99AC", Stellar: "#40B5C4", "???": "#68A090"
	};

	function getMultiplier(attackerType, defenderTypes) {
		var row = CHART[attackerType];
		if (!row) return 1;
		var mult = 1;
		for (var i = 0; i < defenderTypes.length; i++) {
			var t = defenderTypes[i];
			if (row.hasOwnProperty(t)) mult *= row[t];
		}
		return mult;
	}

	// Given the defending Pokemon's type(s), return every attacking type
	// bucketed by how much damage it deals to that Pokemon.
	function getDefensiveProfile(defenderTypes) {
		var buckets = { quad: [], double: [], neutral: [], half: [], quarter: [], immune: [] };
		for (var i = 0; i < TYPES.length; i++) {
			var atk = TYPES[i];
			var mult = getMultiplier(atk, defenderTypes);
			if (mult === 0) buckets.immune.push(atk);
			else if (mult === 4) buckets.quad.push(atk);
			else if (mult === 2) buckets.double.push(atk);
			else if (mult === 1) buckets.neutral.push(atk);
			else if (mult === 0.5) buckets.half.push(atk);
			else if (mult === 0.25) buckets.quarter.push(atk);
		}
		return buckets;
	}

	function effectivenessLabel(mult) {
		if (mult === 0) return "No effect";
		if (mult >= 4) return "4x — super effective";
		if (mult === 2) return "2x — super effective";
		if (mult === 1) return "1x — normal damage";
		if (mult === 0.5) return "0.5x — not very effective";
		if (mult <= 0.25) return "0.25x — barely effective";
		return mult + "x";
	}

	function effectivenessClass(mult) {
		if (mult === 0) return "psh-immune";
		if (mult > 1) return "psh-superb";
		if (mult === 1) return "psh-neutral";
		return "psh-resisted";
	}

	function normalizeId(str) {
		return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
	}

	// Finite table of abilities that turn a type's damage into "no effect,"
	// keyed by normalizeId(ability name). Deliberately excludes flat damage
	// reducers (Filter/Solid Rock/Prism Armor/Thick Fat) — those change
	// magnitude, not the effectiveness bucket, which is out of scope for a
	// heuristic (non-numeric) coach.
	var ABILITY_IMMUNITY = {
		levitate: { blocks: ["Ground"] },
		waterabsorb: { blocks: ["Water"] },
		voltabsorb: { blocks: ["Electric"] },
		stormdrain: { blocks: ["Water"] },
		lightningrod: { blocks: ["Electric"] },
		motordrive: { blocks: ["Electric"] },
		sapsipper: { blocks: ["Grass"] },
		flashfire: { blocks: ["Fire"], note: "also powers up their own Fire moves" },
		dryskin: { blocks: ["Water"], note: "but takes extra damage from Fire moves" }
	};

	var ITEM_IMMUNITY = {
		airballoon: { blocks: ["Ground"] }
	};

	// Real game rules for status-condition immunity by defender TYPE - a
	// separate mechanic from the raw attack-effectiveness chart above, and
	// sometimes divergent from it (e.g. Poison-type is only "resisted" (0.5x)
	// as an attack target, but is a full, unconditional immunity to actually
	// BEING poisoned - so this can't just reuse getMultiplier).
	var STATUS_TYPE_IMMUNITY = {
		psn: ["Poison", "Steel"],
		tox: ["Poison", "Steel"],
		par: ["Electric"],
		brn: ["Fire"],
		frz: ["Ice"]
	};

	function isStatusImmune(statusId, defenderTypes) {
		var blockedBy = STATUS_TYPE_IMMUNITY[statusId];
		if (!blockedBy || !defenderTypes) return false;
		return blockedBy.some(function (t) { return defenderTypes.indexOf(t) !== -1; });
	}

	// Like getMultiplier, but accounts for revealed abilities/items that create
	// immunities outside the raw type chart (e.g. Levitate vs Ground, Air
	// Balloon vs Ground). Only ever applies when ability/item is a known,
	// already-revealed non-empty string — never guesses. Returns {mult, note}
	// so callers can show the reasoning, not just a number.
	function getMultiplierWithAbility(attackerType, defenderTypes, ability, item) {
		var baseMult = getMultiplier(attackerType, defenderTypes);
		var abilityId = normalizeId(ability);
		var itemId = normalizeId(item);

		if (itemId === "ringtarget" && baseMult === 0) {
			// Ring Target cancels the holder's own type-based immunities.
			var recomputed = 1;
			for (var i = 0; i < defenderTypes.length; i++) {
				var row = CHART[attackerType];
				var m = row && row.hasOwnProperty(defenderTypes[i]) ? row[defenderTypes[i]] : 1;
				recomputed *= m === 0 ? 1 : m;
			}
			return { mult: recomputed, note: "Ring Target cancels their type immunity" };
		}

		if (abilityId === "wonderguard") {
			if (baseMult <= 1) return { mult: 0, note: "Wonder Guard blocks anything that isn't super effective" };
			return { mult: baseMult, note: null };
		}

		if (baseMult === 0) return { mult: 0, note: null };

		var abilityEntry = ABILITY_IMMUNITY[abilityId];
		if (abilityEntry && abilityEntry.blocks.indexOf(attackerType) !== -1) {
			return { mult: 0, note: ability + " blocks " + attackerType + (abilityEntry.note ? " (" + abilityEntry.note + ")" : "") };
		}
		var itemEntry = ITEM_IMMUNITY[itemId];
		if (itemEntry && itemEntry.blocks.indexOf(attackerType) !== -1) {
			return { mult: 0, note: item + " blocks " + attackerType };
		}
		if (abilityId === "dryskin" && attackerType === "Fire") {
			return { mult: baseMult, note: "Dry Skin takes extra damage from Fire moves" };
		}

		return { mult: baseMult, note: null };
	}

	// Like getDefensiveProfile, but ability/item-aware. Returns the same
	// buckets plus a notes map ({TypeName: noteString}) for footnote text.
	function getDefensiveProfileWithAbility(defenderTypes, ability, item) {
		var buckets = { quad: [], double: [], neutral: [], half: [], quarter: [], immune: [] };
		var notes = {};
		for (var i = 0; i < TYPES.length; i++) {
			var atk = TYPES[i];
			var result = getMultiplierWithAbility(atk, defenderTypes, ability, item);
			var mult = result.mult;
			if (result.note) notes[atk] = result.note;
			if (mult === 0) buckets.immune.push(atk);
			else if (mult === 4) buckets.quad.push(atk);
			else if (mult === 2) buckets.double.push(atk);
			else if (mult === 1) buckets.neutral.push(atk);
			else if (mult === 0.5) buckets.half.push(atk);
			else if (mult === 0.25) buckets.quarter.push(atk);
		}
		buckets.notes = notes;
		return buckets;
	}

	var GLOSSARY = [
		{ term: "STAB", body: "Same Type Attack Bonus. When a Pokemon uses a move that matches one of its own types, that move deals 1.5x damage. E.g. a Fire-type Pokemon using a Fire move." },
		{ term: "Super effective", body: "A move deals 2x (or 4x, for two weaknesses stacked) damage because the target's type(s) are weak to that move's type." },
		{ term: "Not very effective", body: "A move deals 0.5x (or 0.25x) damage because the target resists that move's type." },
		{ term: "No effect", body: "A move deals 0 damage — the target is fully immune to that type (e.g. Electric moves never hit Ground types)." },
		{ term: "Physical vs Special", body: "Physical moves use Attack vs the target's Defense; Special moves use Sp. Atk vs the target's Sp. Def. Status moves don't deal damage at all." },
		{ term: "Priority", body: "Moves with positive priority (like most 'Quick' or 'Fake Out'-style moves) go before slower moves regardless of Speed. Higher priority always goes first." },
		{ term: "Stat boosts", body: "Moves and abilities can raise or lower stats in stages from -6 to +6. Each stage roughly multiplies the stat by a fixed amount, so a +2 boost hits noticeably harder." },
		{ term: "Status conditions", body: "Burn (brn), Poison (psn/tox), Paralysis (par), Sleep (slp), and Freeze (frz) are the main status conditions — each has a different lingering effect like damage over time or a chance to skip your turn." },
		{ term: "Entry hazards", body: "Moves like Stealth Rock or Spikes stay on the field and damage (or slow) Pokemon as they switch in." },
		{ term: "Terastallize", body: "Once per battle, a Pokemon can Terastallize, changing to (usually) a single Tera Type. This changes its type matchups and gives STAB on that type even if it wasn't one of its original types." },
	];

	window.PSHelper = window.PSHelper || {};
	window.PSHelper.TypeChart = {
		TYPES: TYPES,
		COLORS: COLORS,
		GLOSSARY: GLOSSARY,
		getMultiplier: getMultiplier,
		getDefensiveProfile: getDefensiveProfile,
		effectivenessLabel: effectivenessLabel,
		effectivenessClass: effectivenessClass,
		normalizeId: normalizeId,
		getMultiplierWithAbility: getMultiplierWithAbility,
		getDefensiveProfileWithAbility: getDefensiveProfileWithAbility,
		isStatusImmune: isStatusImmune
	};
})();
