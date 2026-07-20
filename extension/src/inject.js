// Runs in the PAGE's own JS context (injected via a <script> tag by content.js,
// since a Manifest V3 content script's isolated world can't see the page's
// `app`/`window.app` objects directly). Polls the live Showdown client state
// and broadcasts a plain-data snapshot for content.js to render.
(function () {
	var EVENT_NAME = "psh-battle-snapshot";
	var lastSerialized = "";

	function idToDisplayType(t) {
		if (!t) return t;
		return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
	}

	// Local copy of typechart.js's normalizeId: inject.js runs in the page's
	// own JS world (a separate context from the content script), so it can't
	// see window.PSHelper. Keep this in sync with typechart.js by hand rather
	// than trying to share it — the two worlds can't share JS objects/functions.
	function normalizeId(str) {
		return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
	}

	// Deliberately narrow: excludes Random Doubles Battle, Battle Factory,
	// Hackmons Cup, Free-For-All, etc. - formats whose sets don't follow the
	// same near-fixed stat spread randbats.js assumes. battle.tier is set
	// directly from the |tier| protocol line (confirmed against a real replay's
	// "[Gen 9] Random Battle" string).
	var RANDOM_BATTLE_SINGLES_RE = /^\[Gen \d+\] Random Battle$/i;
	function isRandomBattleSingles(battle) {
		return !!(battle && battle.tier && RANDOM_BATTLE_SINGLES_RE.test(battle.tier));
	}

	function resolveMoveId(id) {
		var dexEntry = (window.BattleMovedex && window.BattleMovedex[id]) || null;
		return {
			name: (dexEntry && dexEntry.name) || id,
			id: id,
			type: dexEntry ? idToDisplayType(dexEntry.type) : null,
			category: dexEntry ? dexEntry.category : null,
			basePower: dexEntry ? dexEntry.basePower : null,
			priority: dexEntry ? dexEntry.priority : 0,
			target: dexEntry ? dexEntry.target : null,
			accuracy: dexEntry ? dexEntry.accuracy : null,
			boosts: dexEntry && dexEntry.target === "self" ? dexEntry.boosts || null : null,
			heal: dexEntry ? !!dexEntry.heal : false,
			status: dexEntry ? dexEntry.status || null : null,
			sideCondition: dexEntry ? dexEntry.sideCondition || null : null
		};
	}

	function readPokemon(poke, requestMon) {
		if (!poke) return null;
		var types = [];
		try {
			var result = poke.getTypes ? poke.getTypes() : null;
			if (result && result[0]) {
				types = result[0].slice();
				if (result[1]) types.push(result[1]);
			} else if (poke.types) {
				types = poke.types.slice();
			}
		} catch (e) {
			types = poke.types ? poke.types.slice() : [];
		}
		types = types.map(idToDisplayType).filter(Boolean);

		var boosts = {};
		if (poke.boosts) {
			for (var key in poke.boosts) {
				if (poke.boosts[key]) boosts[key] = poke.boosts[key];
			}
		}

		var volatiles = poke.volatiles ? Object.keys(poke.volatiles) : [];

		var revealedMoves = (poke.moveTrack || []).map(function (entry) {
			var moveName = entry[0].replace(/^\*/, "");
			return resolveMoveId(normalizeId(moveName));
		});

		var speciesId = normalizeId(poke.speciesForme || poke.name);
		var speciesEntry = (window.BattlePokedex && window.BattlePokedex[speciesId]) || null;
		var baseStats = speciesEntry ? speciesEntry.baseStats || null : null;

		var ability = poke.ability || poke.baseAbility || (requestMon && requestMon.ability) || "";
		var item = poke.item || (requestMon && requestMon.item) || "";

		var exactStats = null;
		var allMoves = null;
		if (requestMon) {
			exactStats = requestMon.stats || null;
			if (requestMon.moves) allMoves = requestMon.moves.map(resolveMoveId);
		}

		return {
			name: poke.name || poke.speciesForme || "",
			speciesForme: poke.speciesForme || poke.name || "",
			types: types,
			hp: poke.hp,
			maxhp: poke.maxhp,
			hpPercent: poke.maxhp ? Math.round((poke.hp / poke.maxhp) * 100) : null,
			status: poke.status || "",
			fainted: !!poke.fainted,
			boosts: boosts,
			volatiles: volatiles,
			terastallized: poke.terastallized || null,
			// poke.teraType (the live Pokemon instance field) is only ever
			// populated via the "Open Team Sheets" feature - in an ordinary
			// battle it stays empty. requestMon.canTerastallize is the
			// reliable source: the server always sends it for the player's
			// own active Pokemon, and it's naturally falsy once Tera has
			// already been used this battle (a once-per-TEAM resource), so
			// this doubles as the "is Tera still legal right now" check.
			teraType: poke.teraType || (requestMon && requestMon.canTerastallize) || null,
			level: poke.level || 100,
			ability: ability,
			item: item,
			revealedMoves: revealedMoves,
			baseStats: baseStats,
			exactStats: exactStats,
			allMoves: allMoves
		};
	}

	// battle.nearSide.pokemon only grows as Pokemon actually switch in during
	// the visible battle - same mechanism used for the OPPONENT's side, since
	// the client's battle log/animation code doesn't distinguish "mine" from
	// "theirs." It does NOT list bench Pokemon that haven't appeared yet, even
	// though the player obviously knows their whole team from the start.
	//
	// battle.myPokemon (built by the client's own updateSide() from
	// room.request.side.pokemon, see js/oldclient/client-battle.js) is the
	// actual always-complete roster - the same objects the client itself
	// mutates in place with parsed hp/maxhp/status/fainted/speciesForme
	// (via Battle.prototype.parseHealth/parseDetails) and already carries
	// stats/moves/ability/item/canTerastallize/active straight from the
	// server. This is the correct source for "my whole team," not
	// nearSide.pokemon.
	function readRosterPokemon(mon, nearByIdent) {
		if (!mon) return null;
		var speciesId = normalizeId(mon.speciesForme || mon.name);
		var speciesEntry = (window.BattlePokedex && window.BattlePokedex[speciesId]) || null;
		var types = (speciesEntry && speciesEntry.types || []).map(idToDisplayType).filter(Boolean);

		var live = mon.ident ? nearByIdent[mon.ident] : null;
		var boosts = {};
		var revealedMoves = [];
		var terastallized = mon.terastallized || null;
		if (live) {
			try {
				var result = live.getTypes ? live.getTypes() : null;
				if (result && result[0]) {
					var liveTypes = result[0].slice();
					if (result[1]) liveTypes.push(result[1]);
					types = liveTypes.map(idToDisplayType).filter(Boolean);
				}
			} catch (e) { /* fall back to species-dex types above */ }
			if (live.boosts) {
				for (var key in live.boosts) {
					if (live.boosts[key]) boosts[key] = live.boosts[key];
				}
			}
			revealedMoves = (live.moveTrack || []).map(function (entry) {
				return resolveMoveId(normalizeId(entry[0].replace(/^\*/, "")));
			});
			terastallized = live.terastallized || terastallized;
		}

		return {
			name: mon.name || mon.speciesForme || "",
			speciesForme: mon.speciesForme || mon.name || "",
			types: types,
			hp: mon.hp,
			maxhp: mon.maxhp,
			hpPercent: mon.maxhp ? Math.round((mon.hp / mon.maxhp) * 100) : null,
			status: mon.status || "",
			fainted: !!mon.fainted,
			boosts: boosts,
			terastallized: terastallized,
			teraType: mon.canTerastallize || null,
			level: mon.level || 100,
			ability: mon.ability || mon.baseAbility || "",
			item: mon.item || "",
			revealedMoves: revealedMoves,
			baseStats: speciesEntry ? speciesEntry.baseStats || null : null,
			exactStats: mon.stats || null,
			allMoves: (mon.moves || []).map(resolveMoveId),
			isActive: !!mon.active
		};
	}

	function readMoveData(moveEntry) {
		var id = moveEntry.id || normalizeId(moveEntry.move || "");
		var resolved = resolveMoveId(id);
		resolved.name = moveEntry.move || resolved.name;
		resolved.pp = moveEntry.pp;
		resolved.maxpp = moveEntry.maxpp;
		resolved.disabled = !!moveEntry.disabled;
		return resolved;
	}

	function buildSnapshot() {
		var app = window.app;
		var room = app && app.curRoom;
		if (!room || room.type !== "battle" || !room.battle) {
			return { inBattle: false };
		}

		var battle = room.battle;
		var near = battle.nearSide;
		var far = battle.farSide;
		var request = room.request;

		// Exact stats/moves/ability/item are only ever sent by the server for
		// the player's OWN team (room.request.side.pokemon[]) - never the
		// opponent's, since real EVs/nature/IVs are hidden info in an actual
		// battle. Join by `ident`, which both the live Pokemon objects and the
		// request payload carry in the same "p1: Name" format.
		var requestMonByIdent = {};
		if (request && request.side && request.side.pokemon) {
			request.side.pokemon.forEach(function (mon) {
				requestMonByIdent[mon.ident] = mon;
			});
		}
		function readMyPokemon(poke) {
			return readPokemon(poke, poke ? requestMonByIdent[poke.ident] : null);
		}
		function readFarPokemon(poke) {
			return readPokemon(poke, null);
		}

		var nearByIdent = {};
		(near && near.pokemon || []).forEach(function (p) {
			if (p && p.ident) nearByIdent[p.ident] = p;
		});
		var myRoster = (request && request.side && request.side.pokemon || [])
			.map(function (mon) { return readRosterPokemon(mon, nearByIdent); })
			.filter(Boolean);

		function sideConditionIds(side) {
			return side && side.sideConditions ? Object.keys(side.sideConditions) : [];
		}

		var snapshot = {
			inBattle: true,
			teamPreview: !!(room.request && room.request.teamPreview),
			ended: !!battle.ended,
			mySide: near ? {
				name: near.name || "",
				active: (near.active || []).map(readMyPokemon).filter(Boolean),
				team: myRoster,
				sideConditions: sideConditionIds(near)
			} : null,
			farSide: far ? {
				name: far.name || "",
				active: (far.active || []).map(readFarPokemon).filter(Boolean),
				team: (far.pokemon || []).map(readFarPokemon).filter(Boolean),
				sideConditions: sideConditionIds(far)
			} : null,
			choices: null
		};

		if (request && request.active && request.active[0] && request.active[0].moves) {
			snapshot.choices = {
				moves: request.active[0].moves.map(readMoveData),
				canSwitch: !request.active[0].trapped
			};
		}

		// Side.prototype.faint (the real client code) sets active[slot] = null
		// the INSTANT a Pokemon faints - so mySide.active[0] can't be relied on
		// to detect "you must choose a replacement." request.forceSwitch is the
		// actual protocol signal for this (an array of booleans, one per active
		// slot) and is present even though request.active isn't.
		snapshot.forceSwitch = !!(request && request.forceSwitch && request.forceSwitch[0]);
		snapshot.format = battle.tier || "";
		snapshot.isRandomBattleSingles = isRandomBattleSingles(battle);

		return snapshot;
	}

	function tick() {
		var snapshot;
		try {
			snapshot = buildSnapshot();
		} catch (e) {
			snapshot = { inBattle: false, error: String(e && e.message || e) };
		}
		var serialized = JSON.stringify(snapshot);
		if (serialized !== lastSerialized) {
			lastSerialized = serialized;
			document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: snapshot }));
		}
	}

	setInterval(tick, 400);
	tick();
})();
