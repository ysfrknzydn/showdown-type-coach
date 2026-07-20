// Turn-by-turn "what should I do" recommendation engine. Pure data in/out, no
// DOM/browser dependency - takes the plain-data snapshot pieces content.js
// already has, returns a recommendation object for content.js to render.
//
// Scope, per explicit user decision: heuristic advice only (score-based
// ranking, never a fabricated numeric damage %), and only ever reacts to
// already-revealed opponent info (ability/item once shown, moves once
// actually used/tracked via moveTrack) - never speculative guesses about
// what an unrevealed Pokemon "commonly" runs.
(function () {
	var TC = window.PSHelper.TypeChart;
	var SM = window.PSHelper.StatMath;
	var RB = window.PSHelper.RandBats;
	var DMG = window.PSHelper.Damage;

	var MIN_SWITCH_HP_PERCENT = 20;
	var DEF_BUCKET_POINTS = { immune: 3, quarter: 2, half: 1, neutral: 0, double: -1, quad: -2 };
	// Scales an avg-damage-percent (0-100) up to roughly the same range as the
	// old mult*stab*basePower proxy score (typically 60-300), so switching
	// between "estimate available" and "estimate unavailable" scoring doesn't
	// suddenly change the relative scale everything else compares against.
	var DAMAGE_SCORE_SCALE = 3;

	function moveAccuracyFraction(move) {
		if (move.accuracy === true || move.accuracy == null) return 1;
		return move.accuracy / 100;
	}

	function scoreMove(move, myTypes, opponentTypes, opponentAbility, opponentItem, dmgCtx) {
		if (!move || move.category === "Status" || move.disabled || move.pp === 0) return null;
		if (!move.type) return null;
		var result = TC.getMultiplierWithAbility(move.type, opponentTypes || [], opponentAbility, opponentItem);
		var stab = myTypes && myTypes.indexOf(move.type) !== -1;
		var basePower = move.basePower || 60; // fallback for variable/unlisted-BP moves
		var accuracy = moveAccuracyFraction(move);
		var damageEstimate = dmgCtx ? DMG.estimateDamageRange(move, dmgCtx.attackerCtx, dmgCtx.defenderCtx) : null;
		var score;
		if (damageEstimate) {
			var avgPercent = (damageEstimate.minPercent + damageEstimate.maxPercent) / 2;
			score = avgPercent * accuracy * DAMAGE_SCORE_SCALE;
		} else {
			score = result.mult * (stab ? 1.5 : 1) * basePower * accuracy;
		}
		return { move: move, score: score, mult: result.mult, note: result.note, stab: stab, isStatus: false, damageEstimate: damageEstimate };
	}

	function bestMove(moves, myTypes, opponentTypes, opponentAbility, opponentItem, dmgCtx) {
		var best = null;
		(moves || []).forEach(function (m) {
			var scored = scoreMove(m, myTypes, opponentTypes, opponentAbility, opponentItem, dmgCtx);
			if (scored && (!best || scored.score > best.score)) best = scored;
		});
		return best;
	}

	// Opponent "threat types" = their own types plus any move types we've
	// actually seen them use (moveTrack-derived) - all revealed info.
	function opponentThreatTypes(farActive) {
		var types = (farActive && farActive.types || []).slice();
		(farActive && farActive.revealedMoves || []).forEach(function (m) {
			if (m.type && m.category !== "Status" && types.indexOf(m.type) === -1) types.push(m.type);
		});
		return types;
	}

	function buildContext(myActive, farActive, mySideConditions, farSideConditions) {
		var threatTypes = opponentThreatTypes(farActive);
		var myProfile = TC.getDefensiveProfileWithAbility(myActive.types, myActive.ability, myActive.item);
		var inDanger = threatTypes.some(function (t) {
			return myProfile.double.indexOf(t) !== -1 || myProfile.quad.indexOf(t) !== -1;
		});
		var speedVerdict = null;
		if (SM && myActive.exactStats && myActive.exactStats.spe && farActive.baseStats && farActive.baseStats.spe) {
			var mySpeed = SM.computeExactSpeed(myActive.exactStats.spe, myActive.boosts.spe, myActive.status);
			var oppRange = SM.computeSpeedRange(farActive.baseStats.spe, farActive.level, farActive.boosts.spe, farActive.status);
			speedVerdict = SM.compareSpeed(mySpeed, oppRange);
		}
		return {
			threatTypes: threatTypes,
			inDanger: inDanger,
			speedVerdict: speedVerdict,
			mySideConditions: mySideConditions || [],
			farSideConditions: farSideConditions || []
		};
	}

	// Heuristic scoring for non-damaging moves, calibrated to land in roughly
	// the same range as attack scores (basePower x mult x STAB, typically
	// ~60-300) so they can be fairly ranked against attacks. Deliberately
	// simple - only covers the well-defined mechanical categories (self
	// stat boosts, self recovery, guaranteed status infliction, hazards/
	// screens); anything else (Protect, Substitute, Taunt, etc.) gets a flat
	// baseline so it's still rankable without bespoke per-move logic.
	function scoreStatusMove(move, myActive, farActive, ctx) {
		var hpPercent = myActive.hpPercent === null || myActive.hpPercent === undefined ? 100 : myActive.hpPercent;

		if (move.boosts && move.target === "self") {
			if (ctx.inDanger) return { score: 20, reason: "risky to set up while you're in danger" };
			var totalStages = 0;
			var myBoosts = myActive.boosts || {};
			for (var k in move.boosts) {
				var current = myBoosts[k] || 0;
				var newStage = Math.max(-6, Math.min(6, current + move.boosts[k]));
				totalStages += Math.max(0, newStage - current); // discount stages already capped at +6
			}
			if (totalStages <= 0) return { score: 15, reason: "already maxed out on that stat" };
			return { score: (150 + totalStages * 40) * (hpPercent / 100), reason: "safe opportunity to set up" };
		}

		if (move.heal && move.target === "self") {
			var missing = 100 - hpPercent;
			if (missing < 15) return { score: 10, reason: "already near full HP" };
			return { score: missing * 2, reason: "recovers a big chunk of HP" };
		}

		if (move.status) {
			if (TC.isStatusImmune(move.status, farActive.types)) {
				return { score: 5, reason: "target's type blocks this status" };
			}
			if (farActive.status) return { score: 10, reason: "opponent already has a status condition" };
			var score = 90;
			var reason = "inflicts " + move.status.toUpperCase();
			if (move.status === "par" && ctx.speedVerdict === "outsped") {
				score += 60;
				reason += " — cripples their speed advantage";
			}
			return { score: score, reason: reason };
		}

		if (move.sideCondition) {
			var relevant = move.target === "foeSide" ? ctx.farSideConditions : ctx.mySideConditions;
			if (relevant.indexOf(move.sideCondition) !== -1) return { score: 15, reason: "already in effect" };
			return { score: 110, reason: "sets up a lasting field advantage" };
		}

		return { score: 50, reason: null };
	}

	function scoreAnyMove(move, myActive, farActive, ctx, dmgCtx) {
		if (!move || move.disabled || move.pp === 0) return null;
		if (move.category === "Status") {
			var s = scoreStatusMove(move, myActive, farActive, ctx);
			return { move: move, score: s.score, mult: null, note: s.reason, stab: false, isStatus: true, damageEstimate: null };
		}
		return scoreMove(move, myActive.types, farActive.types, farActive.ability, farActive.item, dmgCtx);
	}

	function bestAnyMove(moves, myActive, farActive, ctx, dmgCtx) {
		var best = null;
		(moves || []).forEach(function (m) {
			var scored = scoreAnyMove(m, myActive, farActive, ctx, dmgCtx);
			if (scored && (!best || scored.score > best.score)) best = scored;
		});
		return best;
	}

	// Turns a snapshot Pokemon into the {level,types,status,ability,item,
	// maxHP,atk,spa,def,spd} shape damage.js expects. useExact=true (own team
	// only) reads exact known stats; useExact=false (opponent only) uses
	// RandBats' Random-Battle stat estimate. Never mixes the two: the
	// opponent's snapshot maxhp is NOT a real number (Pokemon Showdown only
	// ever reports it as a percentage for the foe's side), so RandBats'
	// estimated HP is used instead - confirmed directly against a real replay
	// where every opponent Pokemon showed as "100/100" regardless of species.
	function pokemonDamageContext(pokemon, useExact) {
		if (!pokemon) return null;
		var boosts = pokemon.boosts || {};

		function fixedBoosted(val, stage) {
			if (val === null || val === undefined) return null;
			var v = Math.floor(val * SM.boostMultiplier(stage));
			return { min: v, est: v, max: v };
		}
		function rangeBoosted(range, stage) {
			if (!range) return null;
			var mult = SM.boostMultiplier(stage);
			return { min: Math.floor(range.min * mult), est: Math.floor(range.est * mult), max: Math.floor(range.max * mult) };
		}

		if (useExact) {
			if (!pokemon.exactStats) return null;
			return {
				level: pokemon.level, types: pokemon.types, status: pokemon.status,
				ability: pokemon.ability, item: pokemon.item,
				maxHP: pokemon.maxhp,
				atk: fixedBoosted(pokemon.exactStats.atk, boosts.atk),
				spa: fixedBoosted(pokemon.exactStats.spa, boosts.spa),
				def: fixedBoosted(pokemon.exactStats.def, boosts.def),
				spd: fixedBoosted(pokemon.exactStats.spd, boosts.spd)
			};
		}

		if (!RB) return null;
		var est = RB.estimateAllStats({
			baseStats: pokemon.baseStats, level: pokemon.level,
			ability: pokemon.ability, item: pokemon.item,
			moves: pokemon.revealedMoves || pokemon.allMoves || []
		});
		if (!est) return null;
		return {
			level: pokemon.level, types: pokemon.types, status: pokemon.status,
			ability: pokemon.ability, item: pokemon.item,
			maxHP: est.hp.est,
			atk: rangeBoosted(est.atk, boosts.atk), spa: rangeBoosted(est.spa, boosts.spa),
			def: rangeBoosted(est.def, boosts.def), spd: rangeBoosted(est.spd, boosts.spd)
		};
	}

	// A flat comparison-score for a switch-in candidate, on roughly the same
	// scale as move scores (attack scores run ~60-300; defScore is a small
	// int in [-2*threats, 3*threats], scaled up to compete fairly).
	var SWITCH_DEF_WEIGHT = 40;

	// Real entry-hazard chip damage on switching in. Scoped to Stealth Rock
	// and Spikes specifically (the two with well-understood, verifiable
	// mechanics available from current snapshot data) - Toxic Spikes/Sticky
	// Web are skipped rather than guessed at, since their effect depends on
	// stacked layer counts the snapshot doesn't track yet.
	function hazardDamagePercent(candidate, sideConditionIds) {
		if (!sideConditionIds || !sideConditionIds.length) return 0;
		var itemId = TC.normalizeId(candidate.item);
		if (itemId === "heavydutyboots") return 0; // blocks ALL entry hazard damage

		var percent = 0;
		if (sideConditionIds.indexOf("stealthrock") !== -1) {
			var mult = TC.getMultiplier("Rock", candidate.types || []);
			percent += mult * 12.5; // 1/8 max HP at 1x, scales with type effectiveness
		}
		if (sideConditionIds.indexOf("spikes") !== -1) {
			var abilityId = TC.normalizeId(candidate.ability);
			var grounded = (candidate.types || []).indexOf("Flying") === -1 && abilityId !== "levitate";
			if (grounded) percent += 12.5; // approximates a single layer; real layers 1/6-1/4 not tracked yet
		}
		return percent;
	}

	// benchTeam should already exclude the currently-active Pokemon and any
	// fainted ones (recommend() does this), but candidates are re-filtered
	// here too so this stays correct for any other caller.
	//
	// isRandomBattle gates a real bulk/magnitude signal on top of the type
	// buckets above: when true, estimates the opponent's worst REVEALED
	// damaging move against each candidate's real HP/Def/SpD (never guessing
	// an unrevealed move), and each candidate's best real hit back (already
	// exact - it's our own team). This is what actually answers "will this
	// switch survive," which pure type buckets never could.
	function bestSwitchCandidate(benchTeam, farActive, isRandomBattle, mySideConditions) {
		var opponentTypes = farActive.types || [];
		var threatTypes = opponentThreatTypes(farActive);
		var candidates = (benchTeam || []).filter(function (p) { return p && !p.fainted && !p.isActive; });
		var healthy = candidates.filter(function (p) { return p.hpPercent === null || p.hpPercent >= MIN_SWITCH_HP_PERCENT; });
		if (healthy.length) candidates = healthy;

		var farCtx = isRandomBattle ? pokemonDamageContext(farActive, false) : null;
		var incomingMoves = farCtx ? (farActive.revealedMoves || []).filter(function (m) { return m && m.category !== "Status" && m.basePower; }) : [];

		var best = null;
		candidates.forEach(function (candidate) {
			var profile = TC.getDefensiveProfileWithAbility(candidate.types, candidate.ability, candidate.item);
			var defScore = 0;
			threatTypes.forEach(function (t) {
				var bucket = ["immune", "quarter", "half", "neutral", "double", "quad"].filter(function (b) {
					return profile[b] && profile[b].indexOf(t) !== -1;
				})[0] || "neutral";
				defScore += DEF_BUCKET_POINTS[bucket];
			});
			var offBest = candidate.allMoves ? bestMove(candidate.allMoves, candidate.types, opponentTypes, farActive.ability, farActive.item) : null;
			var offScore = offBest ? offBest.score : 0;

			var hazardPercent = hazardDamagePercent(candidate, mySideConditions);
			// Every ~12.5% of hazard chip costs roughly one DEF_BUCKET_POINTS
			// step, matching the existing bucket scale.
			var hazardAdjustment = -(hazardPercent / 12.5);

			var bulkAdjustment = 0;
			var worstIncoming = null;
			var bestOutgoingEstimate = null;
			var candidateCtx = farCtx ? pokemonDamageContext(candidate, true) : null;

			if (candidateCtx) {
				incomingMoves.forEach(function (m) {
					var est = DMG.estimateDamageRange(m, farCtx, candidateCtx);
					if (est && (!worstIncoming || est.maxPercent > worstIncoming.maxPercent)) {
						worstIncoming = { move: m, minPercent: est.minPercent, maxPercent: est.maxPercent };
					}
				});
				if (worstIncoming) {
					if (worstIncoming.maxPercent >= 100) bulkAdjustment = -3;
					else if (worstIncoming.maxPercent >= 50) bulkAdjustment = -1;
					else if (worstIncoming.maxPercent < 25) bulkAdjustment = 1;
				}

				(candidate.allMoves || []).forEach(function (m) {
					if (!m || m.category === "Status" || !m.basePower) return;
					var est2 = DMG.estimateDamageRange(m, candidateCtx, farCtx);
					if (est2 && (!bestOutgoingEstimate || est2.maxPercent > bestOutgoingEstimate.maxPercent)) {
						bestOutgoingEstimate = { move: m, minPercent: est2.minPercent, maxPercent: est2.maxPercent };
					}
				});
				if (bestOutgoingEstimate) {
					offScore = ((bestOutgoingEstimate.minPercent + bestOutgoingEstimate.maxPercent) / 2) * DAMAGE_SCORE_SCALE;
				}
			}

			// totalScore ranks candidates against EACH OTHER (defense weighted
			// higher - surviving matters more than raw power for a switch-in
			// pick). switchScore is separately scaled to compare a switch
			// against just staying in and using a move (see recommend()).
			var totalScore = defScore * 1.2 + offScore / 50 + bulkAdjustment * 1.2 + hazardAdjustment * 1.2;
			var switchScore = defScore * SWITCH_DEF_WEIGHT + offScore + bulkAdjustment * SWITCH_DEF_WEIGHT + hazardAdjustment * SWITCH_DEF_WEIGHT;
			if (!best || totalScore > best.totalScore) {
				best = {
					candidate: candidate, defScore: defScore, offScore: offScore, totalScore: totalScore,
					switchScore: switchScore, offBest: offBest, bulkAdjustment: bulkAdjustment,
					worstIncoming: worstIncoming, bestOutgoingEstimate: bestOutgoingEstimate,
					hazardPercent: hazardPercent
				};
			}
		});
		return best;
	}

	function recommendTera(myActive, farActive, moves) {
		if (!myActive.teraType || myActive.terastallized) return null;
		var threatTypes = opponentThreatTypes(farActive);
		var currentProfile = TC.getDefensiveProfileWithAbility(myActive.types, myActive.ability, myActive.item);
		var teraTypesArr = [myActive.teraType];

		var flipsWeakness = threatTypes.some(function (t) {
			var wasWeak = currentProfile.double.indexOf(t) !== -1 || currentProfile.quad.indexOf(t) !== -1;
			if (!wasWeak) return false;
			var afterMult = TC.getMultiplier(t, teraTypesArr);
			return afterMult <= 1;
		});

		var unlocksOffense = false;
		var teraMove = null;
		(moves || []).forEach(function (m) {
			if (!m || m.type !== myActive.teraType || m.category === "Status" || m.disabled) return;
			var beforeMult = TC.getMultiplier(m.type, farActive.types || []);
			var wasStab = myActive.types.indexOf(m.type) !== -1;
			if (!wasStab || beforeMult <= 1) {
				unlocksOffense = true;
				teraMove = m;
			}
		});

		if (!flipsWeakness && !unlocksOffense) return null;
		return { teraType: myActive.teraType, flipsWeakness: flipsWeakness, unlocksOffense: unlocksOffense, teraMove: teraMove };
	}

	// Only switch when it's clearly better than the best thing you could do
	// by staying in - a small edge isn't worth losing tempo/momentum over,
	// and without this margin the engine would ping-pong between two
	// mediocre Pokemon turn after turn.
	var SWITCH_MARGIN = 1.3;

	var RANDOM_BATTLE_ESTIMATE_NOTE = "Estimated from Random Battle's known stat spreads — not confirmed until the opponent's item/ability/moves are fully revealed.";

	function pctRange(minP, maxP) {
		return "~" + minP + "-" + maxP + "%";
	}

	function switchReason(pick, forced) {
		var parts = [];
		if (pick.worstIncoming) {
			var w = pick.worstIncoming;
			if (w.maxPercent >= 100) {
				parts.push("risky — their revealed " + w.move.name + " could KO (" + pctRange(w.minPercent, w.maxPercent) + ")");
			} else if (w.maxPercent >= 50) {
				parts.push("their revealed " + w.move.name + " could 2HKO (" + pctRange(w.minPercent, w.maxPercent) + ")");
			} else {
				parts.push("survives their revealed " + w.move.name + " comfortably (" + pctRange(w.minPercent, w.maxPercent) + ")");
			}
		}
		if (pick.bestOutgoingEstimate) {
			var o = pick.bestOutgoingEstimate;
			parts.push("can hit back with " + o.move.name + " (" + pctRange(o.minPercent, o.maxPercent) + ")");
		} else if (pick.offBest) {
			parts.push("can hit back with " + pick.offBest.move.name);
		}
		if (pick.hazardPercent) {
			parts.push("takes ~" + Math.round(pick.hazardPercent) + "% from entry hazards");
		}
		if (!parts.length) return forced ? "Best available matchup right now." : "Better matchup than staying in.";
		return (forced ? "Best available matchup — " : "") + parts.join("; ") + ".";
	}

	function moveReason(topAny) {
		if (topAny.isStatus) return topAny.note || "Best status option this turn";
		if (topAny.damageEstimate) {
			var est = topAny.damageEstimate;
			var kind = est.maxPercent >= 100 ? "likely a KO" : est.maxPercent >= 50 ? "likely a 2HKO" : "chips them down";
			return pctRange(est.minPercent, est.maxPercent) + " damage — " + kind + (topAny.stab ? " (STAB)" : "");
		}
		if (topAny.mult > 1) return topAny.mult + "x effective" + (topAny.stab ? " + STAB" : "") + (topAny.note ? " (" + topAny.note + ")" : "");
		if (topAny.mult === 1) return "Neutral damage, your strongest option right now";
		return "Best available option (resisted)";
	}

	function recommend(snapshot) {
		if (!snapshot || !snapshot.inBattle || snapshot.teamPreview) return { action: "none" };
		var farActive = snapshot.farSide && snapshot.farSide.active[0];
		var benchTeam = (snapshot.mySide && snapshot.mySide.team || []).filter(function (p) { return p && !p.isActive; });
		var isRandomBattle = !!snapshot.isRandomBattleSingles;
		var mySideConditions = snapshot.mySide && snapshot.mySide.sideConditions;

		// battle.js's Side.prototype.faint sets active[0] = null the INSTANT a
		// Pokemon faints, so mySide.active[0] is gone by the time this runs -
		// snapshot.forceSwitch (from room.request.forceSwitch) is the actual
		// signal for "you must choose a replacement now," and this is exactly
		// when a recommendation matters most, so it must never fall through
		// to "no recommendation."
		if (snapshot.forceSwitch) {
			if (!farActive) return { action: "none" };
			var forcedPick = bestSwitchCandidate(benchTeam, farActive, isRandomBattle, mySideConditions);
			if (forcedPick && forcedPick.candidate) {
				return {
					action: "switch",
					target: forcedPick.candidate,
					headline: "Send out " + forcedPick.candidate.name,
					reason: switchReason(forcedPick, true),
					estimateNote: forcedPick.worstIncoming || forcedPick.bestOutgoingEstimate ? RANDOM_BATTLE_ESTIMATE_NOTE : null
				};
			}
			return { action: "none" };
		}

		var myActive = snapshot.mySide && snapshot.mySide.active[0];
		if (!myActive || !farActive) return { action: "none" };
		if (!snapshot.choices || !snapshot.choices.moves || !snapshot.choices.moves.length) return { action: "none" };

		var moves = snapshot.choices.moves;
		var ctx = buildContext(myActive, farActive, snapshot.mySide.sideConditions, snapshot.farSide.sideConditions);

		var myCtx = isRandomBattle ? pokemonDamageContext(myActive, true) : null;
		var farCtxForMoves = isRandomBattle ? pokemonDamageContext(farActive, false) : null;
		var dmgCtx = (myCtx && farCtxForMoves) ? { attackerCtx: myCtx, defenderCtx: farCtxForMoves } : null;

		var topAttack = bestMove(moves, myActive.types, farActive.types, farActive.ability, farActive.item, dmgCtx);
		var topAny = bestAnyMove(moves, myActive, farActive, ctx, dmgCtx);
		var tera = recommendTera(myActive, farActive, moves);

		if (tera && tera.teraMove && topAttack && tera.teraMove.id === topAttack.move.id) {
			return {
				action: "tera-move",
				teraType: tera.teraType,
				move: topAttack.move,
				headline: "Terastallize to " + tera.teraType + " and use " + topAttack.move.name,
				reason: tera.unlocksOffense
					? "Becomes super effective as a " + tera.teraType + "-type STAB move."
					: "Flips a bad defensive matchup while you attack."
			};
		}

		// Switching and attacking/status-ing are scored on a comparable scale
		// (see bestSwitchCandidate's switchScore and any move's score) so the
		// engine can catch a clearly-better switch even when staying in isn't
		// technically "dangerous" - not just gate on danger alone, which
		// missed plenty of good offensive switch-in opportunities.
		var switchPick = snapshot.choices.canSwitch ? bestSwitchCandidate(benchTeam, farActive, isRandomBattle, mySideConditions) : null;
		var stayScore = topAny ? topAny.score : 0;
		var hasGoodAttack = topAttack && topAttack.mult > 1;
		// A good attack only cancels out real danger if you actually move
		// first - if you're slower, you eat the opponent's hit regardless of
		// what you choose this turn, so "I also have a good attack" doesn't
		// make staying in safe. If you outspeed, you take zero retaliation
		// risk this turn, so pressing the attack is unconditionally fine.
		var iOutspeed = ctx.speedVerdict === "outspeed";
		var pressAttackSafe = hasGoodAttack && iOutspeed;
		var switchWorthwhile = switchPick && switchPick.candidate && (
			(ctx.inDanger && !pressAttackSafe) || switchPick.switchScore > stayScore * SWITCH_MARGIN
		);

		if (switchWorthwhile) {
			return {
				action: "switch",
				target: switchPick.candidate,
				headline: "Switch to " + switchPick.candidate.name,
				reason: switchReason(switchPick, false),
				tip: tera ? "Tera to " + tera.teraType + " was also an option this turn." : null,
				estimateNote: switchPick.worstIncoming || switchPick.bestOutgoingEstimate ? RANDOM_BATTLE_ESTIMATE_NOTE : null
			};
		}

		if (topAny) {
			return {
				action: topAny.isStatus ? "status" : "move",
				target: topAny.move,
				headline: "Use " + topAny.move.name,
				reason: moveReason(topAny),
				tip: tera ? "Tera to " + tera.teraType + " was also an option this turn." : null,
				estimateNote: topAny.damageEstimate ? RANDOM_BATTLE_ESTIMATE_NOTE : null
			};
		}

		return { action: "none" };
	}

	window.PSHelper = window.PSHelper || {};
	window.PSHelper.Recommend = {
		scoreMove: scoreMove,
		bestMove: bestMove,
		scoreAnyMove: scoreAnyMove,
		bestAnyMove: bestAnyMove,
		bestSwitchCandidate: bestSwitchCandidate,
		recommendTera: recommendTera,
		opponentThreatTypes: opponentThreatTypes,
		recommend: recommend
	};
})();
