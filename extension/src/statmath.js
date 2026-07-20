// Pure stat-math helpers, no DOM/browser dependency. Loaded as a plain script
// before content.js (and after typechart.js); everything hangs off
// window.PSHelper.StatMath.
//
// The opponent's real EVs/IVs/nature are never sent to the client - that's
// genuine hidden information in an actual battle, same as real competitive
// play. So for the opponent we can only ever compute a possible RANGE
// (min..max) off their base stat + level, never a single exact number. For
// the player's own team, exact stats ARE known (see inject.js's merge of
// room.request.side.pokemon[].stats), so those get a single exact value.
(function () {
	// Standard stat formula (non-HP): floor(floor((2*base+iv+floor(ev/4))*level/100)+5) * natureMod
	function statAt(base, level, iv, ev, natureMod) {
		var core = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
		return Math.floor(core * natureMod);
	}

	// Standard HP formula (no nature applies to HP).
	function hpAt(base, level, iv, ev) {
		return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
	}

	function statRange(baseStat, level) {
		return {
			min: statAt(baseStat, level, 0, 0, 0.9),
			max: statAt(baseStat, level, 31, 252, 1.1)
		};
	}

	function boostMultiplier(stage) {
		if (!stage) return 1;
		return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
	}

	function computeSpeedRange(baseSpeed, level, boostStage, status) {
		var range = statRange(baseSpeed, level);
		var mult = boostMultiplier(boostStage);
		var parMult = status === "par" ? 0.5 : 1;
		return {
			min: Math.floor(range.min * mult * parMult),
			max: Math.floor(range.max * mult * parMult)
		};
	}

	function computeExactSpeed(exactSpeStat, boostStage, status) {
		var mult = boostMultiplier(boostStage);
		var parMult = status === "par" ? 0.5 : 1;
		return Math.floor(exactSpeStat * mult * parMult);
	}

	function compareSpeed(mySpeedExact, opponentRange) {
		if (mySpeedExact > opponentRange.max) return "outspeed";
		if (mySpeedExact < opponentRange.min) return "outsped";
		if (opponentRange.min === opponentRange.max && mySpeedExact === opponentRange.min) return "tie";
		return "uncertain";
	}

	window.PSHelper = window.PSHelper || {};
	window.PSHelper.StatMath = {
		statRange: statRange,
		boostMultiplier: boostMultiplier,
		computeSpeedRange: computeSpeedRange,
		computeExactSpeed: computeExactSpeed,
		compareSpeed: compareSpeed,
		rawStat: statAt,
		rawHP: hpAt
	};
})();
