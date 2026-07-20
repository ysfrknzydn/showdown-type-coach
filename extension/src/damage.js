// Approximate damage-percent estimation, no DOM/browser dependency. Loaded
// after typechart.js, statmath.js, and randbats.js.
//
// One pure function: attacker context + defender context + move -> a percent
// range. Deliberately separate from recommend.js (which stays the
// orchestration/scoring layer) - this only depends on typechart.js.
//
// Scope: STAB, ability/item-aware type effectiveness (reuses
// TypeChart.getMultiplierWithAbility - Levitate/Air Balloon/etc. already
// handled there), the real 0.85-1.00 damage roll, and burn-halving physical
// damage. Deliberately NOT modeled (documented gaps, consistent with no
// weather/terrain tracking elsewhere in this extension): weather/terrain
// boosts, screens, multi-target spread reduction, critical hits, flat
// damage-reducing abilities (Filter/Solid Rock/Thick Fat/etc.), and Gen 9's
// Tera-matches-original-type 2x STAB case (the snapshot's `types` field is
// already post-Terastallize, so the pre-Tera original types needed to
// detect that case aren't preserved anywhere - a documented simplification,
// not a new gap).
(function () {
	var TC = window.PSHelper.TypeChart;

	function estimateDamageRange(move, attackerCtx, defenderCtx) {
		if (!move || !attackerCtx || !defenderCtx) return null;
		if (move.category === "Status") return null;
		if (!defenderCtx.maxHP) return null;

		var isPhysical = move.category === "Physical";
		var atkRange = isPhysical ? attackerCtx.atk : attackerCtx.spa;
		var defRange = isPhysical ? defenderCtx.def : defenderCtx.spd;
		if (!atkRange || !defRange) return null;

		var bp = move.basePower || 60; // same documented fallback scoreMove already uses

		var typeResult = TC.getMultiplierWithAbility(move.type, defenderCtx.types || [], defenderCtx.ability, defenderCtx.item);
		if (typeResult.mult === 0) return { minPercent: 0, maxPercent: 0, note: typeResult.note };

		var stab = (attackerCtx.types || []).indexOf(move.type) !== -1 ? 1.5 : 1;
		var burnMult = (isPhysical && attackerCtx.status === "brn") ? 0.5 : 1;
		var level = attackerCtx.level || 100;

		function baseDamage(atk, def) {
			return Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * bp * atk / def / 50) + 2);
		}

		var maxDamage = baseDamage(atkRange.max, defRange.min) * stab * typeResult.mult * burnMult * 1.00;
		var minDamage = baseDamage(atkRange.min, defRange.max) * stab * typeResult.mult * burnMult * 0.85;

		var maxPercent = Math.max(0, Math.min(100, Math.round((maxDamage / defenderCtx.maxHP) * 100)));
		var minPercent = Math.max(0, Math.min(100, Math.round((minDamage / defenderCtx.maxHP) * 100)));

		return { minPercent: minPercent, maxPercent: maxPercent, note: typeResult.note };
	}

	window.PSHelper = window.PSHelper || {};
	window.PSHelper.Damage = { estimateDamageRange: estimateDamageRange };
})();
