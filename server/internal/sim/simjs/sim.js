var JezeroSim = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	// src/sim/config.ts
	/**
	* Todos os números de jogo num lugar só (docs/game-design.md, "Sistemas e regras").
	* São SIMPLIFICADOS para o jogo (classificação INTERPRETADO). O que é real é a erupção, não a escala.
	* Mudou um número? Rode `npm run balance` e confira que a forma do equilíbrio se mantém.
	*/
	var CONFIG = {
		sols: 15,
		/**
		* Sóis de introdução (GDD, "Introdução: sóis 1 a 3"): um guia mostra a base, a mensagem da Terra, a energia de dia
		* e de noite e um treino de poeira e de tempestade solar (só visual). Nesses sóis não há cartas, problemas pela base
		* nem tempestade de poeira; as tempestades solares já começam no sol 4. A energia e a noite valem normalmente.
		*/
		intro: { sols: 3 },
		energy: {
			panelBlocks: 10,
			minBlocks: 2
		},
		battery: {
			start: 50,
			perLeftoverBlock: 10,
			nightCost: 20,
			max: 100,
			lifePerMissingPoint: .6
		},
		life: {
			start: 70,
			stableBlocks: 3,
			perBlock: 6,
			max: 100
		},
		shield: {
			start: 40,
			decay: 4,
			perBlock: 8,
			max: 100
		},
		dose: {
			start: 0,
			perSol: 1,
			max: 100,
			shieldFactor: .85
		},
		science: {
			perBlock: 3,
			stormFactor: .5,
			goal: 100
		},
		/**
		* Tubos de amostra do rover (GDD, "Tubos de amostra"). O total é REAL: o Perseverance levou 43 tubos,
		* 38 para amostras (docs/ciencia-marte.md, F14). O resto é regra do jogo (INTERPRETADO): todo sol com
		* energia na ciência, o rover faz uma expedição e enche `perExpedition` tubos; sem tubos, ele só mede
		* com os instrumentos e a ciência do dia vale `noTubeFactor`.
		*/
		samples: {
			tubes: 38,
			perExpedition: 3,
			noTubeFactor: .5
		},
		dust: {
			windCleanPerSol: 6,
			max: 80,
			stormAdd: 40,
			stormHoldSols: 3
		},
		solarStorms: {
			count: 3,
			firstSol: 4,
			lastSol: 14,
			minGap: 2,
			/** Intensidade no jogo por classe da erupção real (C só aparece no modo simulado). */
			intensity: {
				C: 10,
				M: 25,
				X: 45
			},
			/**
			* Missões históricas (CMEs do DONKI): a força calculada pelo script a partir do tipo de
			* velocidade da CME (S/C = fraca, O = média, R/ER = forte) usa a mesma escala das erupções.
			*/
			strengthClass: {
				weak: "C",
				medium: "M",
				strong: "X"
			},
			commDelayMin: {
				min: 3,
				max: 22
			},
			/**
			* Clima espacial atual (destaque do desafio): a PRIMEIRA tempestade da missão é sorteada entre as N erupções
			* reais mais recentes do DONKI (as outras continuam sorteadas de todo o histórico). Valor de jogo.
			*/
			recentPool: 5
		},
		dustStorm: {
			firstSol: 4,
			lastSol: 12
		},
		cards: {
			perGame: 4,
			firstSol: 4,
			lastSol: 14
		},
		/** Problemas pela base (GDD, "Tempo da tripulação"). Dia em tempo real com duração fixa. */
		problems: {
			firstSol: 4,
			minPerDay: 1,
			maxPerDay: 2,
			/** Segundos do dia em que o problema pode aparecer. */
			spawnWindow: {
				min: 3,
				max: 35
			},
			daySeconds: 75,
			/** Câmara de descompressão: segundos para sair e para voltar (GDD). */
			airlockSeconds: 3,
			/** Dose ao terminar uma tarefa fora da base (escala do jogo, INTERPRETADO). */
			outsideDose: 1,
			effects: {
				dust: 20,
				lifeLeak: 10,
				shieldBag: 8
			}
		},
		/**
		* Tarefas dentro da base (GDD, "Atividades dentro da base", A): opcionais, uma vez por dia, sem dose.
		* Colher na estufa (comida: suporte de vida) e analisar amostras (ciência). Valores de jogo (INTERPRETADO).
		* Cada uma gasta bateria (luz das plantas, instrumentos do laboratório): nenhuma escolha é de graça.
		* Câmbio do jogo: 1 bloco = 10 de bateria = 6 de vida = 3 de ciência. Colher troca meio bloco por meio bloco;
		* analisar dá um pouco mais que um bloco de ciência, mas sem gastar tubos do rover.
		*/
		indoorTasks: {
			harvest: {
				seconds: 15,
				life: 3,
				battery: 5
			},
			analysis: {
				seconds: 20,
				science: 4,
				battery: 10
			}
		},
		/**
		* EVA (saída da base com traje). A tripulação fica dentro por padrão; problema de fora exige EVA.
		* Regras de jogo (INTERPRETADO), inspiradas no planejamento da NASA (GDD, "EVA: sair da base").
		*/
		eva: {
			/** No máximo uma dupla fora ao mesmo tempo. */
			maxOutside: 2,
			/** No sol em que a tempestade chega (com o aviso da Terra recebido), ninguém sai. */
			banOnStormDay: true
		},
		/**
		* Cartas do rover (GDD, "Cartas de decisão"). Números de jogo (INTERPRETADO); os fatos reais
		* por trás delas têm fonte no GDD (MOXIE, AutoNav do Perseverance, Spirit atolado).
		*/
		rover: {
			moxie: {
				battery: -15,
				life: 10
			},
			route: {
				safeScience: 5,
				shortcutScience: 15,
				shortcutStuckChance: .5
			}
		},
		stars: { doseFor3: 50 },
		/**
		* Base lunar (polo sul da Lua): só o que MUDA em relação a Marte; o resto das regras é igual.
		* Números de jogo (INTERPRETADO); os fatos reais por trás deles têm fonte no GDD ("Base lunar").
		*/
		moon: {
			/** Sem atmosfera: a radiação de todo dia é cerca de 2x a de Marte (Chang'e 4 LND × Curiosity RAD). */
			dosePerSol: 2,
			/** Sem ar para frear as partículas, a tempestade solar pesa mais. */
			stormFactor: 1.2,
			/** Sem vento: a poeira não sai sozinha dos painéis. */
			windCleanPerSol: 0,
			/** Um astronauta limpando os painéis (problema resolvido) tira esta poeira. */
			crewCleanDust: 20,
			/**
			* Sem noite a cada 24 h: no alto de uma borda de cratera do polo sul o Sol não se põe todo dia. O fim do turno é o
			* descanso da tripulação (a base segue gastando com ar, água e computadores). Só nos dias de sombra há noite de
			* verdade, muito fria (cerca de −170 °C), e os aquecedores gastam mais.
			*/
			restCost: 15,
			shadowNightCost: 30,
			/** Sombra das montanhas do polo sul: dias seguidos com pouca luz (substitui a tempestade de poeira). */
			shadow: {
				firstSol: 4,
				lastSol: 11,
				sols: 3
			},
			/**
			* Luz do Sol de cada dia (%). Sem ar, o Sol pleno na Lua é forte (mais que o dobro da luz que chega a Marte),
			* então 100% de luz dá mais blocos que em Marte. Mas no polo sul o Sol anda rente ao horizonte e passa atrás de
			* morros mais altos ou mais baixos: a luz muda dia a dia, e dá para prever (caminho do Sol + relevo).
			* O relevo e a curva são do jogo (INTERPRETADO); o que é real é o porquê.
			*/
			sun: {
				fullBlocks: 14,
				/** Dias comuns: luz entre min e 100%. */
				minLight: 40,
				/** Dias de sombra das montanhas: só uma beirada do Sol aparece. */
				shadowLight: {
					min: 25,
					max: 35
				},
				/** O Sol dá a volta no horizonte em ~29,5 dias; os morros fazem a luz subir e descer em ciclos de alguns dias. */
				cycleDays: {
					min: 5,
					max: 8
				},
				/** Quantos dias à frente a previsão mostra. */
				forecastDays: 2
			},
			/** A luz leva ~1,3 s da Terra à Lua (384.400 km). Só para mostrar; as mensagens chegam na hora. */
			commDelaySec: 1.3,
			/** A 3ª estrela: dose abaixo disto (a radiação de todo dia já é o dobro da de Marte). */
			doseFor3: 70,
			/** Pedir ajuda à Terra custa pouco: a resposta chega em segundos. */
			askEarthScience: -3
		}
	};
	var DIFFICULTIES = [
		"easy",
		"medium",
		"hard"
	];
	/**
	* Níveis da missão. O Médio é o jogo de sempre (os números do CONFIG acima). A idade recomendada de cada nível
	* (diferente em Marte e na Lua) fica na interface: RECOMMENDED_AGE em src/ui/level.ts.
	*
	* NUNCA muda com o nível o que vem de dado real da NASA: a força de cada tempestade solar (classe da erupção do
	* DONKI, `solarStorms.intensity`), o atraso real das mensagens, as datas das missões históricas e os fatos de
	* docs/ciencia-marte.md. O nível muda só quanta energia, folga e pressa a tripulação tem.
	*/
	var DIFFICULTY = {
		easy: {
			extraBlocks: 2,
			batteryStart: 70,
			lifeStart: 80,
			cards: 2,
			problemsPerDay: {
				min: 1,
				max: 1
			},
			daySeconds: 90,
			scienceGoal: 80,
			showForecast: true,
			historical: "medium"
		},
		medium: {
			extraBlocks: 0,
			batteryStart: CONFIG.battery.start,
			lifeStart: CONFIG.life.start,
			cards: CONFIG.cards.perGame,
			problemsPerDay: {
				min: CONFIG.problems.minPerDay,
				max: CONFIG.problems.maxPerDay
			},
			daySeconds: CONFIG.problems.daySeconds,
			scienceGoal: CONFIG.science.goal,
			showForecast: true,
			historical: "any"
		},
		hard: {
			extraBlocks: -1,
			batteryStart: 40,
			lifeStart: 70,
			cards: 5,
			problemsPerDay: {
				min: 1,
				max: 2
			},
			daySeconds: 60,
			scienceGoal: 100,
			showForecast: false,
			historical: "any"
		}
	};
	/** Números do nível. Sem nível (estado antigo, servidor antigo), é o Médio. */
	function tuning(difficulty) {
		var _DIFFICULTY;
		return (_DIFFICULTY = DIFFICULTY[difficulty !== null && difficulty !== void 0 ? difficulty : "medium"]) !== null && _DIFFICULTY !== void 0 ? _DIFFICULTY : DIFFICULTY.medium;
	}
	/** Dose máxima para a 3ª estrela (na Lua é mais alta: a dose de todo dia é o dobro). */
	function doseFor3(location) {
		return location === "moon" ? CONFIG.moon.doseFor3 : CONFIG.stars.doseFor3;
	}
	// src/sim/cards.ts
	/**
	* Cartas de decisão (docs/game-design.md, "Cartas de decisão").
	* Regra: TODA opção tem custo, direto ou de oportunidade.
	*/
	var CARDS = {
		dustyPanels: {
			id: "dustyPanels",
			options: [{ id: "clean" }, { id: "wait" }]
		},
		mysteryRock: {
			id: "mysteryRock",
			options: [{ id: "sendRover" }, { id: "skip" }]
		},
		greenhouseLeak: {
			id: "greenhouseLeak",
			options: [{ id: "fixNow" }, { id: "fixLater" }]
		},
		cargoShip: {
			id: "cargoShip",
			options: [
				{ id: "batteries" },
				{ id: "shieldKit" },
				{ id: "experiment" }
			]
		},
		brokenSensor: {
			id: "brokenSensor",
			options: [{ id: "askEarth" }, { id: "fixAlone" }]
		},
		subsurfaceIce: {
			id: "subsurfaceIce",
			options: [{ id: "drill" }, { id: "notNow" }]
		},
		moxie: {
			id: "moxie",
			options: [{ id: "run" }, { id: "save" }]
		},
		roverRoute: {
			id: "roverRoute",
			options: [{ id: "safe" }, { id: "shortcut" }]
		}
	};
	var CARD_IDS = Object.keys(CARDS);
	/** Cartas que só fazem sentido em Marte (o MOXIE tira oxigênio do ar de Marte; a Lua não tem ar). */
	var MARS_ONLY_CARDS = ["moxie"];
	/** Efeito imediato ao aparecer a carta (antes da escolha). */
	function onCardDrawn(id, res) {
		if (id === "dustyPanels") res.dust = Math.min(CONFIG.dust.max, res.dust + 25);
	}
	/** Aplica a opção escolhida; devolve as linhas de relatório. */
	function applyCardOption(id, option, res, rng, location = "mars") {
		const b = CONFIG.battery;
		const lines = [];
		const add = (key, delta) => {
			const max = key === "battery" ? b.max : key === "shield" ? CONFIG.shield.max : key === "life" ? CONFIG.life.max : key === "dust" ? CONFIG.dust.max : Infinity;
			res[key] = clamp(res[key] + delta, 0, max);
		};
		switch (`${id}:${option}`) {
			case "dustyPanels:clean":
				add("dust", -30);
				add("dose", 4);
				break;
			case "mysteryRock:sendRover":
				add("science", 15);
				add("battery", -20);
				break;
			case "greenhouseLeak:fixNow":
				add("battery", -15);
				add("science", -5);
				break;
			case "greenhouseLeak:fixLater":
				add("life", -15);
				break;
			case "cargoShip:batteries":
				add("battery", 30);
				break;
			case "cargoShip:shieldKit":
				add("shield", 30);
				break;
			case "cargoShip:experiment":
				add("science", 15);
				break;
			case "brokenSensor:askEarth":
				add("science", location === "moon" ? CONFIG.moon.askEarthScience : -10);
				break;
			case "brokenSensor:fixAlone":
				if (rng.chance(.5)) {
					add("battery", -20);
					lines.push({
						key: "card.brokenSensor.failed",
						tone: "bad"
					});
				} else lines.push({
					key: "card.brokenSensor.worked",
					tone: "good"
				});
				break;
			case "subsurfaceIce:drill":
				add("battery", -20);
				add("life", 20);
				break;
			case "moxie:run":
				add("battery", CONFIG.rover.moxie.battery);
				add("life", CONFIG.rover.moxie.life);
				break;
			case "roverRoute:safe":
				add("science", CONFIG.rover.route.safeScience);
				break;
			case "roverRoute:shortcut": add("science", CONFIG.rover.route.shortcutScience);
		}
		lines.unshift({ key: `card.${id}.${option}.result` });
		return lines;
	}
	function clamp(v, min, max) {
		return Math.max(min, Math.min(max, v));
	}
	// src/sim/rng.ts
	function createRng(seed) {
		let a = seed >>> 0;
		const next = () => {
			a = a + 1831565813 >>> 0;
			let t = a;
			t = Math.imul(t ^ t >>> 15, t | 1);
			t ^= t + Math.imul(t ^ t >>> 7, t | 61);
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
		const int = (min, max) => min + Math.floor(next() * (max - min + 1));
		return {
			next,
			int,
			pick: (items) => items[Math.floor(next() * items.length)],
			shuffle: (items) => {
				const out = [...items];
				for (let i = out.length - 1; i > 0; i--) {
					const j = Math.floor(next() * (i + 1));
					[out[i], out[j]] = [out[j], out[i]];
				}
				return out;
			},
			chance: (p) => next() < p
		};
	}
	// src/sim/problems.ts
	var PROBLEMS = {
		dustyPanels: {
			kind: "dustyPanels",
			taskSeconds: 15,
			outside: true,
			optional: false
		},
		greenhouseLeak: {
			kind: "greenhouseLeak",
			taskSeconds: 10,
			outside: false,
			optional: false
		},
		antenna: {
			kind: "antenna",
			taskSeconds: 15,
			outside: true,
			optional: false
		},
		roverStuck: {
			kind: "roverStuck",
			taskSeconds: 20,
			outside: true,
			optional: false
		},
		tornBag: {
			kind: "tornBag",
			taskSeconds: 10,
			outside: true,
			optional: false
		},
		harvest: {
			kind: "harvest",
			taskSeconds: CONFIG.indoorTasks.harvest.seconds,
			outside: false,
			optional: true
		},
		analysis: {
			kind: "analysis",
			taskSeconds: CONFIG.indoorTasks.analysis.seconds,
			outside: false,
			optional: true
		}
	};
	/** Só os problemas de verdade (os opcionais não entram no sorteio, senão todas as partidas mudariam). */
	var PROBLEM_KINDS = Object.keys(PROBLEMS).filter((k) => !PROBLEMS[k].optional);
	/** Tarefas opcionais de dentro, na ordem em que aparecem na lista do dia. */
	var OPTIONAL_KINDS = Object.keys(PROBLEMS).filter((k) => PROBLEMS[k].optional);
	/** Segundos de trabalho no local. A câmara de descompressão é contada à parte, na saída da EVA. */
	/** Bateria que uma tarefa opcional gasta ao terminar (0 para os problemas). */
	function taskBattery(kind) {
		return kind === "harvest" || kind === "analysis" ? CONFIG.indoorTasks[kind].battery : 0;
	}
	/**
	* Sorteia os problemas do dia: só a partir do sol 3, 1 ou 2 por dia, tipos diferentes.
	* `exclude`: tipos que já continuam de ontem (não aparecem duas vezes no mesmo lugar).
	*/
	function scheduleProblems(sol, rng, nextUid, exclude = [], perDay = {
		min: CONFIG.problems.minPerDay,
		max: CONFIG.problems.maxPerDay
	}) {
		const c = CONFIG.problems;
		if (sol < c.firstSol) return [];
		const count = rng.int(perDay.min, perDay.max);
		const problems = rng.shuffle(PROBLEM_KINDS.filter((k) => !exclude.includes(k))).slice(0, count).map((kind) => ({
			uid: nextUid(),
			kind,
			spawnAt: rng.int(c.spawnWindow.min, c.spawnWindow.max),
			status: "pending",
			progress: 0
		})).sort((a, b) => a.spawnAt - b.spawnAt);
		const tasks = OPTIONAL_KINDS.map((kind) => ({
			uid: nextUid(),
			kind,
			spawnAt: 0,
			status: "pending",
			progress: 0
		}));
		return [...problems, ...tasks];
	}
	// \0@oxc-project+runtime@0.156.0/helpers/esm/typeof.js
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	// \0@oxc-project+runtime@0.156.0/helpers/esm/toPrimitive.js
	function toPrimitive(t, r) {
		if ("object" != _typeof(t) || !t) return t;
		var e = t[Symbol.toPrimitive];
		if (void 0 !== e) {
			var i = e.call(t, r || "default");
			if ("object" != _typeof(i)) return i;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return ("string" === r ? String : Number)(t);
	}
	// \0@oxc-project+runtime@0.156.0/helpers/esm/toPropertyKey.js
	function toPropertyKey(t) {
		var i = toPrimitive(t, "string");
		return "symbol" == _typeof(i) ? i : i + "";
	}
	// \0@oxc-project+runtime@0.156.0/helpers/esm/defineProperty.js
	function _defineProperty(e, r, t) {
		return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
			value: t,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = t, e;
	}
	// \0@oxc-project+runtime@0.156.0/helpers/esm/objectSpread2.js
	function ownKeys(e, r) {
		var t = Object.keys(e);
		if (Object.getOwnPropertySymbols) {
			var o = Object.getOwnPropertySymbols(e);
			r && (o = o.filter(function(r) {
				return Object.getOwnPropertyDescriptor(e, r).enumerable;
			})), t.push.apply(t, o);
		}
		return t;
	}
	function _objectSpread2(e) {
		for (var r = 1; r < arguments.length; r++) {
			var t = null != arguments[r] ? arguments[r] : {};
			r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
				_defineProperty(e, r, t[r]);
			}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
				Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
			});
		}
		return e;
	}
	// src/sim/day.ts
	function simulateDay(input) {
		var _input$location, _input$nightCost;
		const { plan, blocks, stormClass, dustHold, failed } = input;
		const location = (_input$location = input.location) !== null && _input$location !== void 0 ? _input$location : "mars";
		const moon = location === "moon";
		const r = _objectSpread2({}, input.res);
		const leftover = blocks - plan.life - plan.shield - plan.science;
		const lifeDelta = (plan.life - CONFIG.life.stableBlocks) * CONFIG.life.perBlock;
		r.life = clamp(r.life + lifeDelta, 0, CONFIG.life.max);
		const shieldDelta = plan.shield * CONFIG.shield.perBlock - CONFIG.shield.decay;
		r.shield = clamp(r.shield + shieldDelta, 0, CONFIG.shield.max);
		const roverStuck = failed.includes("roverStuck");
		const expedition = plan.science > 0 && !roverStuck;
		const tubesUsed = expedition ? Math.min(CONFIG.samples.perExpedition, r.tubes) : 0;
		const noTubes = expedition && tubesUsed === 0;
		const sciGain = roverStuck ? 0 : plan.science * CONFIG.science.perBlock * (stormClass ? CONFIG.science.stormFactor : 1) * (noTubes ? CONFIG.samples.noTubeFactor : 1);
		r.science += sciGain;
		r.tubes -= tubesUsed;
		r.battery = Math.min(CONFIG.battery.max, r.battery + leftover * CONFIG.battery.perLeftoverBlock);
		const nightCost = (_input$nightCost = input.nightCost) !== null && _input$nightCost !== void 0 ? _input$nightCost : CONFIG.battery.nightCost;
		r.battery -= nightCost;
		let missing = 0;
		let lifeLost = 0;
		if (r.battery < 0) {
			missing = -r.battery;
			lifeLost = round1$1(missing * CONFIG.battery.lifePerMissingPoint);
			r.life = clamp(r.life - lifeLost, 0, CONFIG.life.max);
			r.battery = 0;
		}
		const sd = stormClass ? stormDose(stormClass, r.shield, location) : 0;
		r.dose += sd;
		r.dose += moon ? CONFIG.moon.dosePerSol : CONFIG.dose.perSol;
		const windClean = moon ? CONFIG.moon.windCleanPerSol : CONFIG.dust.windCleanPerSol;
		if (!dustHold && r.dust > 0) r.dust = Math.max(0, r.dust - windClean);
		const fx = CONFIG.problems.effects;
		for (const kind of failed) {
			if (kind === "dustyPanels") r.dust = Math.min(CONFIG.dust.max, r.dust + fx.dust);
			if (kind === "greenhouseLeak") r.life = clamp(r.life - fx.lifeLeak, 0, CONFIG.life.max);
			if (kind === "tornBag") r.shield = clamp(r.shield - fx.shieldBag, 0, CONFIG.shield.max);
		}
		r.life = round1$1(r.life);
		r.dose = round1$1(r.dose);
		return {
			after: r,
			leftover,
			lifeDelta,
			shieldDelta,
			sciGain,
			roverStuck,
			expedition,
			tubesUsed,
			noTubes,
			missing,
			lifeLost,
			stormDose: sd,
			nightCost
		};
	}
	/**
	* dose = max(1, round(intensidade × (1 − blindagem/100 × 0,85))). Escala do jogo (INTERPRETADO).
	* Na Lua, sem atmosfera, a intensidade é multiplicada por CONFIG.moon.stormFactor.
	*/
	function stormDose(cls, shield, location = "mars") {
		const intensity = CONFIG.solarStorms.intensity[cls] * (location === "moon" ? CONFIG.moon.stormFactor : 1);
		return Math.max(1, Math.round(intensity * (1 - shield / 100 * CONFIG.dose.shieldFactor)));
	}
	function round1$1(n) {
		return Math.round(n * 10) / 10;
	}
	CONFIG.eva.maxOutside;
	/** Este problema só se resolve lá fora (exige EVA)? */
	function needsEva(kind) {
		return PROBLEMS[kind].outside;
	}
	/**
	* EVA proibida hoje: a Terra avisou que a tempestade chega esta noite.
	* Sem o aviso (antena desalinhada), a tripulação não sabe, e a regra não vale.
	* Recebe só as mensagens, para servir também ao estado que vem do servidor no modo em grupo.
	*/
	function isEvaBanned(state) {
		return CONFIG.eva.banOnStormDay && state.messages.some((m) => m.kind === "stormToday");
	}
	// src/sim/mission.ts
	/** Cartas substituídas pelos problemas da tripulação (GDD: "Eles substituem as cartas..."). */
	var CARD_POOL = CARD_IDS.filter((id) => id !== "dustyPanels" && id !== "greenhouseLeak");
	/** Na Lua, sem as cartas que só existem em Marte. */
	var MOON_CARD_POOL = CARD_POOL.filter((id) => !MARS_ONLY_CARDS.includes(id));
	/**
	* Simulação pura da missão (docs/game-design.md). Sem DOM, sem Three.js:
	* roda igual no navegador e no Node (`npm run balance`).
	*/
	var Mission = class {
		/**
		* @param realFlares erupções reais para sortear (usadas quando não há missão histórica)
		* @param historical missão histórica: tempestades e atraso das mensagens vêm dela, com datas reais (só Marte:
		*   o atraso é Terra-Marte)
		* @param location Marte (padrão) ou Lua (docs/game-design.md, "Base lunar")
		* @param difficulty nível (padrão: Médio, o jogo de sempre). Muda só a escala do jogo; as tempestades reais e os
		*   atrasos reais são os mesmos em todos os níveis. Os sorteios também: a mesma semente dá os mesmos sóis.
		*/
		constructor(seed, realFlares = [], historical = null, location = "mars", difficulty = "medium") {
			_defineProperty(this, "state", void 0);
			_defineProperty(this, "rng", void 0);
			_defineProperty(
				this,
				/** Linhas geradas durante o sol (carta, problemas resolvidos), entram no relatório do mesmo sol. */
				"cardLines",
				[]
			);
			_defineProperty(
				this,
				/** Fatos reais já mostrados nesta missão (cada um aparece uma vez só). */
				"factsShown",
				/* @__PURE__ */ new Set()
			);
			_defineProperty(this, "uid", 0);
			_defineProperty(
				this,
				/** Antena desalinhada na noite anterior: sem mensagens no próximo sol. */
				"nextCommsDown",
				false
			);
			_defineProperty(
				this,
				/** Problemas que continuam no próximo sol (trabalho pela metade em noite de tempestade). */
				"carryOver",
				[]
			);
			_defineProperty(
				this,
				/** Números do nível (src/sim/config.ts, DIFFICULTY). */
				"tuning",
				void 0
			);
			this.rng = createRng(seed);
			const level = DIFFICULTIES.includes(difficulty) ? difficulty : "medium";
			this.tuning = tuning(level);
			const tune = this.tuning;
			const moon = location === "moon";
			if (moon) historical = null;
			const storms = historical ? this.historicalStorms(historical) : this.scheduleStorms(realFlares, moon);
			const stormSols = new Set(storms.map((s) => s.sol));
			const event = moon ? CONFIG.moon.shadow : CONFIG.dustStorm;
			let eventSol;
			do
				eventSol = this.rng.int(event.firstSol, event.lastSol);
			while (stormSols.has(eventSol));
			const dustStormSol = moon ? 0 : eventSol;
			const shadowSol = moon ? eventSol : 0;
			const cardSols = /* @__PURE__ */ new Map();
			const sols = this.rng.shuffle(range(CONFIG.cards.firstSol, CONFIG.cards.lastSol).filter((s) => s !== eventSol)).slice(0, tune.cards);
			const ids = this.rng.shuffle(moon ? MOON_CARD_POOL : CARD_POOL).slice(0, tune.cards);
			sols.forEach((s, i) => cardSols.set(s, ids[i]));
			const sunlight = moon ? this.sunProfile(shadowSol) : [];
			this.state = {
				seed,
				location,
				difficulty: level,
				historical,
				sol: 0,
				res: {
					battery: tune.batteryStart,
					life: tune.lifeStart,
					shield: CONFIG.shield.start,
					dose: CONFIG.dose.start,
					science: 0,
					dust: 0,
					tubes: CONFIG.samples.tubes
				},
				blocks: CONFIG.energy.panelBlocks,
				storms,
				dustStormSol,
				shadowSol,
				sunlight,
				dustHold: 0,
				cardSols,
				pendingCard: null,
				messages: [],
				problems: [],
				commsDown: false,
				reports: [],
				outcome: { status: "playing" }
			};
			this.startSol(1);
		}
		/**
		* Erupções reais das tempestades: a primeira é uma das mais recentes (o Sol de agora, `recentPool`); as outras
		* vêm de todo o histórico. Determinístico pela semente: o servidor do modo em grupo recebe a mesma lista.
		*/
		pickFlares(realFlares, count) {
			const dated = realFlares.filter((f) => f.time).sort((a, b) => a.time < b.time ? 1 : a.time > b.time ? -1 : 0);
			if (dated.length === 0) return this.rng.shuffle(realFlares).slice(0, count);
			const recent = dated.slice(0, Math.min(CONFIG.solarStorms.recentPool, dated.length));
			const first = recent[this.rng.int(0, recent.length - 1)];
			return [first, ...this.rng.shuffle(realFlares.filter((f) => f !== first)).slice(0, count - 1)];
		}
		scheduleStorms(realFlares, moon = false) {
			const { count, firstSol, lastSol, minGap, commDelayMin } = CONFIG.solarStorms;
			let sols = [];
			for (let tries = 0; tries < 1e3; tries++) {
				sols = this.rng.shuffle(range(firstSol, lastSol)).slice(0, count).sort((a, b) => a - b);
				if (sols.every((s, i) => i === 0 || s - sols[i - 1] >= minGap)) break;
			}
			const flares = realFlares.length >= count ? this.pickFlares(realFlares, count) : sols.map(() => this.simulatedFlare());
			return sols.map((sol, i) => ({
				sol,
				flare: flares[i],
				delayMin: moon ? 0 : this.rng.int(commDelayMin.min, commDelayMin.max)
			}));
		}
		/** Tempestades fixas da missão; o aviso chega um sol antes, com o atraso real daquele sol. */
		historicalStorms(h) {
			return h.storms.map((s) => ({
				sol: s.sol,
				flare: s.flare,
				delayMin: h.delays[s.sol - 2]
			}));
		}
		simulatedFlare() {
			const r = this.rng.next();
			const cls = r < .3 ? "C" : r < .7 ? "M" : "X";
			return {
				cls,
				label: cls,
				real: false
			};
		}
		get stormToday() {
			return this.state.storms.find((s) => s.sol === this.state.sol);
		}
		/**
		* Luz do Sol (%) de cada dia na Lua: o Sol anda rente ao horizonte e passa atrás de morros, então a luz sobe e
		* desce em ciclos de alguns dias (com variação de um dia para o outro). Nos dias de sombra, só uma beirada aparece.
		* Arredondado de 5 em 5 para a criança ler fácil.
		*/
		sunProfile(shadowSol) {
			const { minLight, shadowLight, cycleDays } = CONFIG.moon.sun;
			const period = this.rng.int(cycleDays.min, cycleDays.max);
			const phase = this.rng.next() * Math.PI * 2;
			const out = [];
			for (let d = 1; d <= CONFIG.sols; d++) {
				if (d >= shadowSol && d < shadowSol + CONFIG.moon.shadow.sols) {
					out.push(round5(this.rng.int(shadowLight.min, shadowLight.max)));
					continue;
				}
				const k = clamp(.5 + .5 * Math.sin(2 * Math.PI * d / period + phase) + (this.rng.next() - .5) * .3, 0, 1);
				out.push(round5(minLight + (100 - minLight) * k));
			}
			return out;
		}
		/** Luz do Sol de hoje (%); 100 em Marte (lá a energia muda pela poeira). */
		sunlightToday(sol = this.state.sol) {
			var _this$state$sunlight;
			return this.state.location === "moon" ? (_this$state$sunlight = this.state.sunlight[sol - 1]) !== null && _this$state$sunlight !== void 0 ? _this$state$sunlight : 100 : 100;
		}
		/** Bateria gasta até amanhã: noite de Marte; na Lua, descanso da tripulação ou noite fria da sombra. */
		nightCost() {
			if (this.state.location !== "moon") return CONFIG.battery.nightCost;
			return this.shadowLeft() > 0 ? CONFIG.moon.shadowNightCost : CONFIG.moon.restCost;
		}
		/** Dias de sombra que faltam, contando hoje (0 = sem sombra hoje). Só na Lua. */
		shadowLeft(sol = this.state.sol) {
			const start = this.state.shadowSol;
			if (!start || sol < start) return 0;
			return Math.max(0, start + CONFIG.moon.shadow.sols - sol);
		}
		startSol(sol) {
			const s = this.state;
			s.sol = sol;
			if (sol === s.dustStormSol) {
				s.res.dust = Math.min(CONFIG.dust.max, s.res.dust + CONFIG.dust.stormAdd);
				s.dustHold = CONFIG.dust.stormHoldSols;
			}
			s.commsDown = this.nextCommsDown;
			this.nextCommsDown = false;
			s.messages = s.commsDown ? [{ kind: "noSignal" }] : this.buildMessages(sol);
			const carried = this.carryOver.map((p) => p.kind);
			s.problems = [...this.carryOver, ...scheduleProblems(sol, this.rng, () => ++this.uid, carried, this.tuning.problemsPerDay)];
			this.carryOver = [];
			const cardId = s.cardSols.get(sol);
			if (cardId) {
				onCardDrawn(cardId, s.res);
				s.pendingCard = CARDS[cardId];
			} else s.pendingCard = null;
			this.cardLines = [];
			this.updateBlocks();
		}
		buildMessages(sol) {
			const s = this.state;
			const h = s.historical;
			const moon = s.location === "moon";
			const delay = () => moon ? 0 : h ? h.delays[sol - 1] : this.rng.int(CONFIG.solarStorms.commDelayMin.min, CONFIG.solarStorms.commDelayMin.max);
			const msgs = [];
			for (const storm of s.storms) {
				if (storm.sol === sol + 1) msgs.push({
					kind: "stormAlert",
					flare: storm.flare,
					delayMin: storm.delayMin,
					impactSol: storm.sol
				});
				if (storm.sol === sol) msgs.push({
					kind: "stormToday",
					flare: storm.flare,
					delayMin: h ? h.delays[sol - 1] : storm.delayMin
				});
			}
			if (s.dustStormSol && s.dustStormSol === sol + 1) msgs.push({
				kind: "dustAlert",
				delayMin: delay(),
				sol: s.dustStormSol
			});
			if (s.dustStormSol && s.dustStormSol === sol) msgs.push({ kind: "dustNow" });
			if (s.shadowSol && s.shadowSol === sol + 1) msgs.push({
				kind: "shadowAlert",
				delayMin: delay(),
				sol: s.shadowSol
			});
			if (this.shadowLeft(sol) > 0) msgs.push({
				kind: "shadowNow",
				left: this.shadowLeft(sol)
			});
			if (msgs.length === 0) msgs.push({
				kind: "allClear",
				delayMin: delay()
			});
			if (moon) {
				const next = s.sunlight.slice(sol, sol + CONFIG.moon.sun.forecastDays);
				msgs.push({
					kind: "sunForecast",
					today: this.sunlightToday(sol),
					next
				});
			}
			return msgs;
		}
		/**
		* Blocos do dia, reduzidos na proporção da poeira, mínimo 2.
		* Marte: 10. Lua: 14 com Sol pleno, vezes a luz do Sol de hoje. O nível soma ou tira blocos antes (`extraBlocks`).
		*/
		updateBlocks() {
			const { panelBlocks, minBlocks } = CONFIG.energy;
			const extra = this.tuning.extraBlocks;
			const light = this.state.location === "moon" ? (CONFIG.moon.sun.fullBlocks + extra) * this.sunlightToday() / 100 : panelBlocks + extra;
			this.state.blocks = Math.max(minBlocks, Math.round(light * (1 - this.state.res.dust / 100)));
		}
		answerCard(optionId) {
			const card = this.state.pendingCard;
			if (!card) throw new Error("Nenhuma carta pendente");
			if (!card.options.some((o) => o.id === optionId)) throw new Error(`Opção inválida: ${optionId}`);
			const lines = applyCardOption(card.id, optionId, this.state.res, this.rng, this.state.location);
			if (card.id === "roverRoute" && optionId === "shortcut") lines.push(this.shortcutOutcome());
			this.cardLines.push(...lines);
			this.state.pendingCard = null;
			this.updateBlocks();
			this.checkLoss();
			return lines;
		}
		/**
		* Atalho do rover: com chance, ele atola hoje (vira o problema "Rover atolado", que precisa de resgate).
		* Se o rover já ia atolar hoje, não cria outro.
		*/
		shortcutOutcome() {
			if (!this.rng.chance(CONFIG.rover.route.shortcutStuckChance)) return {
				key: "card.roverRoute.ok",
				tone: "good"
			};
			const s = this.state;
			if (!s.problems.some((p) => p.kind === "roverStuck" && p.status !== "done")) {
				const w = CONFIG.problems.spawnWindow;
				s.problems.push({
					uid: ++this.uid,
					kind: "roverStuck",
					spawnAt: w.min,
					status: "pending",
					progress: 0
				});
				s.problems.sort((a, b) => a.spawnAt - b.spawnAt);
			}
			return {
				key: "card.roverRoute.stuck",
				tone: "bad"
			};
		}
		/** Fato real ligado ao que aconteceu, mostrado uma vez por missão (GDD, "Fatos reais dos rovers"). */
		factOnce(key) {
			if (this.factsShown.has(key)) return [];
			this.factsShown.add(key);
			return [{
				key,
				tone: "neutral"
			}];
		}
		/** EVA proibida hoje (regra em src/sim/eva.ts, isEvaBanned). */
		get evaBanned() {
			return isEvaBanned(this.state);
		}
		problem(uid) {
			const p = this.state.problems.find((x) => x.uid === uid);
			if (!p) throw new Error(`Problema inexistente: ${uid}`);
			return p;
		}
		/** O relógio do dia chegou ao `spawnAt`: o problema aparece na base. */
		openProblem(uid) {
			const p = this.problem(uid);
			if (p.status === "pending") p.status = "open";
		}
		/** Progresso do trabalho (0–1), informado pela cena enquanto um astronauta trabalha. */
		setProblemProgress(uid, progress) {
			const p = this.problem(uid);
			if (p.status !== "done") p.progress = clamp(progress, 0, 1);
		}
		/** Um astronauta terminou o trabalho. Fora da base, soma dose (GDD). */
		resolveProblem(uid) {
			const p = this.problem(uid);
			if (p.status === "done") return;
			p.status = "done";
			p.progress = 1;
			if (PROBLEMS[p.kind].optional) {
				this.finishTask(p.kind);
				return;
			}
			const outside = PROBLEMS[p.kind].outside;
			if (outside) this.state.res.dose = round1(this.state.res.dose + CONFIG.problems.outsideDose);
			if (p.kind === "dustyPanels" && this.state.location === "moon" && this.state.res.dust > 0) {
				this.state.res.dust = Math.max(0, this.state.res.dust - CONFIG.moon.crewCleanDust);
				this.updateBlocks();
			}
			this.cardLines.push({
				key: outside ? "report.problem.fixedOutside" : "report.problem.fixed",
				params: {
					problem: `problem.${p.kind}`,
					dose: CONFIG.problems.outsideDose
				},
				tone: "good"
			});
			this.checkLoss();
		}
		/** Tarefa opcional de dentro terminada: aplica o bônus, sem dose (GDD, "Atividades dentro da base", A). */
		finishTask(kind) {
			const r = this.state.res;
			const t = CONFIG.indoorTasks;
			const battery = taskBattery(kind);
			r.battery = Math.max(0, r.battery - battery);
			if (kind === "harvest") {
				r.life = Math.min(CONFIG.life.max, r.life + t.harvest.life);
				this.cardLines.push({
					key: "report.task.harvest",
					params: {
						life: t.harvest.life,
						battery
					},
					tone: "good"
				});
			} else if (kind === "analysis") {
				r.science += t.analysis.science;
				this.cardLines.push({
					key: "report.task.analysis",
					params: {
						science: t.analysis.science,
						battery
					},
					tone: "good"
				});
			}
			this.checkLoss();
		}
		isPlanValid(plan) {
			const total = plan.life + plan.shield + plan.science;
			return [
				plan.life,
				plan.shield,
				plan.science
			].every((n) => Number.isInteger(n) && n >= 0) && total <= this.state.blocks;
		}
		/** Executa o dia e a noite com o plano de energia; avança para o próximo sol. */
		endSol(plan) {
			const s = this.state;
			if (s.outcome.status !== "playing") throw new Error("Missão já terminou");
			if (s.pendingCard) throw new Error("Responda a carta antes de terminar o sol");
			if (!this.isPlanValid(plan)) throw new Error("Plano de energia inválido");
			const before = _objectSpread2({}, s.res);
			const lines = [...this.cardLines];
			const storm = this.stormToday;
			const unresolved = s.problems.filter((p) => p.status !== "done" && !PROBLEMS[p.kind].optional);
			const waitedEva = this.evaBanned ? unresolved.filter((p) => PROBLEMS[p.kind].outside) : [];
			const carried = [...waitedEva, ...storm ? unresolved.filter((p) => p.progress > 0 && !waitedEva.includes(p)) : []];
			const failed = unresolved.filter((p) => !carried.includes(p));
			const day = simulateDay({
				location: s.location,
				res: s.res,
				plan,
				blocks: s.blocks,
				stormClass: storm ? storm.flare.cls : null,
				dustHold: s.dustHold > 0,
				failed: failed.map((p) => p.kind),
				nightCost: this.nightCost()
			});
			const r = day.after;
			s.res = r;
			lines.push({
				key: day.lifeDelta === 0 ? "report.life.stable" : day.lifeDelta > 0 ? "report.life.up" : "report.life.down",
				params: {
					blocks: plan.life,
					delta: Math.abs(day.lifeDelta)
				},
				tone: day.lifeDelta < 0 ? "bad" : day.lifeDelta > 0 ? "good" : "neutral"
			});
			lines.push({
				key: "report.shield",
				params: {
					blocks: plan.shield,
					value: Math.round(clamp(before.shield + day.shieldDelta, 0, CONFIG.shield.max))
				},
				tone: day.shieldDelta < 0 ? "bad" : "good"
			});
			if (day.roverStuck && plan.science > 0) lines.push({
				key: "report.problem.roverStuck",
				params: { blocks: plan.science },
				tone: "bad"
			});
			else if (plan.science > 0) lines.push({
				key: storm ? "report.science.storm" : "report.science",
				params: {
					blocks: plan.science,
					gain: day.sciGain
				},
				tone: "good"
			});
			if (day.tubesUsed > 0) lines.push({
				key: "report.tubes",
				params: {
					n: day.tubesUsed,
					left: r.tubes,
					total: CONFIG.samples.tubes
				},
				tone: r.tubes <= CONFIG.samples.perExpedition * 2 ? "bad" : "neutral"
			});
			else if (day.noTubes) lines.push({
				key: "report.tubes.none",
				tone: "bad"
			});
			if (day.leftover > 0) lines.push({
				key: "report.battery.saved",
				params: {
					blocks: day.leftover,
					gain: day.leftover * CONFIG.battery.perLeftoverBlock
				}
			});
			if (day.missing > 0) lines.push({
				key: "report.night.short",
				params: {
					missing: day.missing,
					lifeLost: day.lifeLost
				},
				tone: "bad"
			});
			else if (s.location === "moon" && this.shadowLeft() > 0) lines.push({
				key: "report.night.shadow",
				params: { cost: day.nightCost }
			});
			else lines.push({
				key: "report.night.ok",
				params: { cost: day.nightCost }
			});
			let stormResult = null;
			if (storm) {
				stormResult = {
					flare: storm.flare,
					dose: day.stormDose
				};
				const key = storm.flare.source === "cme" ? "report.storm.cme" : "report.storm";
				const shieldAtStorm = clamp(before.shield + day.shieldDelta, 0, CONFIG.shield.max);
				lines.push({
					key,
					params: {
						label: storm.flare.label,
						dose: day.stormDose,
						shield: Math.round(shieldAtStorm)
					},
					tone: "bad"
				});
			}
			if (s.dustHold > 0) {
				s.dustHold--;
				if (before.dust > 0) lines.push({
					key: "report.dust.hold",
					params: { dust: Math.round(before.dust) },
					tone: "bad"
				});
			} else if (before.dust > 0 && s.location === "moon") lines.push({
				key: "report.dust.noWind",
				params: { dust: Math.round(r.dust) },
				tone: "bad"
			});
			else if (before.dust > 0) lines.push({
				key: "report.dust.wind",
				params: { dust: Math.round(Math.max(0, before.dust - CONFIG.dust.windCleanPerSol)) }
			});
			if (this.shadowLeft() > 0) lines.push({
				key: "report.shadow",
				params: { blocks: s.blocks },
				tone: "bad"
			});
			else if (s.location === "moon") {
				const light = this.sunlightToday();
				lines.push({
					key: "report.sunlight",
					params: {
						light,
						blocks: s.blocks
					},
					tone: light >= 80 ? "good" : light <= 55 ? "bad" : "neutral"
				});
			}
			const fx = CONFIG.problems.effects;
			for (const p of failed) {
				if (p.kind === "antenna") this.nextCommsDown = true;
				if (p.kind !== "roverStuck") lines.push({
					key: `report.problem.failed.${p.kind}`,
					params: fx,
					tone: "bad"
				});
			}
			for (const p of carried) {
				const key = waitedEva.includes(p) ? "report.problem.evaBanned" : "report.problem.carried";
				lines.push({
					key,
					params: { problem: `problem.${p.kind}` }
				});
			}
			this.carryOver = carried.map((p) => _objectSpread2(_objectSpread2({}, p), {}, {
				status: "open",
				spawnAt: 0
			}));
			const roverStuckToday = s.problems.some((p) => p.kind === "roverStuck" && p.status !== "pending");
			if (s.location === "moon") {
				if (s.sol === 1) lines.push(...this.factOnce("fact.moon.radiation"));
				if (s.sol === 2) lines.push(...this.factOnce("fact.moon.sun"));
				if (s.sol === s.shadowSol) lines.push(...this.factOnce("fact.moon.shadow"));
				if (roverStuckToday) lines.push(...this.factOnce("fact.moon.lunokhod"));
				if (s.problems.some((p) => p.kind === "antenna" && p.status !== "pending")) lines.push(...this.factOnce("fact.moon.relay"));
			} else {
				if (s.sol === 1) lines.push(...this.factOnce("fact.battery"));
				if (s.sol === s.dustStormSol) lines.push(...this.factOnce("fact.opportunity"));
				if (roverStuckToday) lines.push(...this.factOnce("fact.spirit"));
				if (day.tubesUsed > 0) lines.push(...this.factOnce("fact.tubes"));
			}
			const report = {
				sol: s.sol,
				plan: _objectSpread2({}, plan),
				before,
				after: _objectSpread2({}, r),
				storm: stormResult,
				lines
			};
			s.reports.push(report);
			this.checkLoss();
			if (s.outcome.status === "playing") {
				if (s.sol >= CONFIG.sols) s.outcome = {
					status: "won",
					stars: this.stars()
				};
				else this.startSol(s.sol + 1);
			}
			return report;
		}
		/**
		* Prévia do plano de energia: o que acontece se o sol terminar com este plano, SEM contar os
		* problemas do dia (ainda não apareceram). Usa o mesmo cálculo do fim do sol; não muda nada.
		*/
		previewSol(plan) {
			const s = this.state;
			const storm = this.stormToday;
			const day = simulateDay({
				location: s.location,
				res: s.res,
				plan,
				blocks: s.blocks,
				stormClass: storm ? storm.flare.cls : null,
				dustHold: s.dustHold > 0,
				failed: [],
				nightCost: this.nightCost()
			});
			const tomorrow = s.messages.some((m) => m.kind === "stormAlert") ? s.storms.find((x) => x.sol === s.sol + 1) : void 0;
			return _objectSpread2(_objectSpread2({}, day), {}, {
				stormTonight: storm ? storm.flare : null,
				stormTomorrow: tomorrow ? tomorrow.flare : null,
				doseTomorrowIfNow: tomorrow ? stormDose(tomorrow.flare.cls, day.after.shield, s.location) : 0
			});
		}
		checkLoss() {
			const s = this.state;
			if (s.outcome.status !== "playing") return;
			if (s.res.life <= 0) s.outcome = {
				status: "lost",
				reason: "life",
				sol: s.sol
			};
			else if (s.res.dose >= CONFIG.dose.max) s.outcome = {
				status: "lost",
				reason: "dose",
				sol: s.sol
			};
		}
		stars() {
			const r = this.state.res;
			if (r.science < this.tuning.scienceGoal) return 1;
			if (r.dose >= doseFor3(this.state.location)) return 2;
			return 3;
		}
	};
	function range(a, b) {
		return Array.from({ length: b - a + 1 }, (_, i) => a + i);
	}
	function round5(n) {
		return Math.round(n / 5) * 5;
	}
	function round1(n) {
		return Math.round(n * 10) / 10;
	}
	// src/sim/historical.ts
	/** Converte o arquivo; descarta missão incompleta em vez de quebrar o jogo. */
	function parseMissions(data) {
		if ((data === null || data === void 0 ? void 0 : data.schemaVersion) !== 1 || !Array.isArray(data.missions)) return [];
		const out = [];
		for (const m of data.missions) {
			var _m$sols, _m$storms;
			const delays = ((_m$sols = m.sols) !== null && _m$sols !== void 0 ? _m$sols : []).slice().sort((a, b) => a.sol - b.sol).map((s) => s.earthDelayMinutes);
			const storms = ((_m$storms = m.storms) !== null && _m$storms !== void 0 ? _m$storms : []).flatMap((s) => {
				var _s$link;
				const cls = CONFIG.solarStorms.strengthClass[s.strength];
				if (!cls || !Number.isInteger(s.sol)) return [];
				return [{
					sol: s.sol,
					flare: {
						cls,
						label: s.cmeType,
						real: true,
						time: s.startTime,
						link: (_s$link = s.link) !== null && _s$link !== void 0 ? _s$link : void 0,
						source: "cme",
						speedKmS: s.speedKmS
					}
				}];
			});
			if ((m.difficulty === "medium" || m.difficulty === "hard") && delays.length === CONFIG.sols && delays.every((d) => Number.isFinite(d) && d > 0) && storms.length === CONFIG.solarStorms.count) out.push({
				id: m.id,
				difficulty: m.difficulty,
				startUtc: m.startUtc,
				endUtc: m.endUtc,
				storms,
				delays
			});
		}
		return out;
	}
	/**
	* Sorteia a missão histórica (GDD, "Regras"). Nível Médio: na primeira partida só as de força média; depois, qualquer
	* uma. Fácil: só as de força média. Difícil: só as fortes. As tempestades e as datas são as reais em todos os níveis.
	*/
	function pickHistorical(missions, seed, firstGame, difficulty = "medium") {
		const want = tuning(difficulty).historical;
		const only = want === "any" ? firstGame ? "medium" : null : want;
		const pool = only ? missions.filter((m) => m.difficulty === only) : missions;
		const list = pool.length > 0 ? pool : missions;
		return list.length > 0 ? createRng(seed ^ 2654435769).pick(list) : null;
	}
	// src/sim/actions.ts
	/** Aplica uma ação à missão. Ação inválida (opção que não existe, plano acima dos blocos) lança erro. */
	function applyAction(mission, action) {
		switch (action.type) {
			case "answerCard": return { lines: mission.answerCard(action.option) };
			case "openProblem":
				mission.openProblem(action.uid);
				return {};
			case "problemProgress":
				mission.setProblemProgress(action.uid, action.progress);
				return {};
			case "resolveProblem":
				mission.resolveProblem(action.uid);
				return {};
			case "endSol": return { report: mission.endSol(action.plan) };
		}
	}
	// src/sim/bridge.ts
	/**
	* Ponte da simulação para o servidor coop em Go (ADR 0006, docs/servidor-coop.md).
	*
	* `npm run sim:bundle` empacota este arquivo (e tudo de src/sim) em
	* server/internal/sim/simjs/sim.js; o Go roda esse JS com goja. Assim as REGRAS existem
	* num lugar só: mudou src/sim, o servidor acompanha no próximo build.
	*
	* Tudo entra e sai como JSON (texto): evita converter objetos entre JS e Go.
	* Cada runtime do Go tem UMA missão (uma sala).
	*/
	var mission = null;
	function current() {
		if (!mission) throw new Error("missão não criada");
		return mission;
	}
	/** Estado completo, no mesmo formato do GameState (cardSols vira objeto). */
	function state() {
		const s = current().state;
		return JSON.stringify(_objectSpread2(_objectSpread2({}, s), {}, { cardSols: Object.fromEntries(s.cardSols) }));
	}
	/**
	* `location` e `difficulty` são opcionais. O servidor manda "mars" e o nível que o dono da sala escolheu; sem nível,
	* Médio (Lua só no solo, por enquanto).
	*/
	function newMission(seed, flaresJson, historicalJson, location, difficulty) {
		const flares = JSON.parse(flaresJson);
		const historical = JSON.parse(historicalJson);
		mission = new Mission(seed >>> 0, flares, historical, location === "moon" ? "moon" : "mars", difficulty !== null && difficulty !== void 0 ? difficulty : "medium");
	}
	/**
	* Aplica qualquer interação (src/sim/actions.ts) e devolve o resultado em JSON.
	* As funções abaixo (answerCard, endSol…) são atalhos dela que o servidor Go já chama.
	*/
	function apply(actionJson) {
		return JSON.stringify(applyAction(current(), JSON.parse(actionJson)));
	}
	function answerCard(option) {
		applyAction(current(), {
			type: "answerCard",
			option
		});
	}
	function isPlanValid(planJson) {
		return current().isPlanValid(JSON.parse(planJson));
	}
	function endSol(planJson) {
		return JSON.stringify(applyAction(current(), {
			type: "endSol",
			plan: JSON.parse(planJson)
		}).report);
	}
	/** Prévia do plano (a mesma conta do fim do sol). "null" se a carta ainda não foi respondida ou o plano é inválido. */
	function previewSol(planJson) {
		const m = current();
		const plan = JSON.parse(planJson);
		if (m.state.pendingCard || !m.isPlanValid(plan)) return "null";
		return JSON.stringify(m.previewSol(plan));
	}
	/** EVA proibida hoje (tempestade avisada)? Regra em src/sim/eva.ts. */
	function evaBanned() {
		return current().evaBanned;
	}
	/** O problema pode ser consertado agora? Com a EVA proibida, os de fora não (ninguém pode sair). */
	function canResolve(uid) {
		const m = current();
		const p = m.state.problems.find((x) => x.uid === uid);
		return !!p && !(m.evaBanned && needsEva(p.kind));
	}
	function openProblem(uid) {
		applyAction(current(), {
			type: "openProblem",
			uid
		});
	}
	function setProblemProgress(uid, progress) {
		applyAction(current(), {
			type: "problemProgress",
			uid,
			progress
		});
	}
	function resolveProblem(uid) {
		applyAction(current(), {
			type: "resolveProblem",
			uid
		});
	}
	/** Missões históricas: a mesma leitura e o mesmo sorteio do jogo solo. */
	function parseMissionsJson(raw) {
		return JSON.stringify(parseMissions(JSON.parse(raw)));
	}
	function pickHistoricalJson(missionsJson, seed, firstGame, difficulty) {
		const level = difficulty !== null && difficulty !== void 0 ? difficulty : "medium";
		return JSON.stringify(pickHistorical(JSON.parse(missionsJson), seed >>> 0, firstGame, level));
	}
	/**
	* Números de jogo que o servidor também usa (relógio do dia, atraso das mensagens da Terra). `difficulty` traz os
	* níveis: o servidor valida o nível escolhido pelo dono da sala e usa a duração do dia de cada um.
	*/
	function config() {
		return JSON.stringify(_objectSpread2(_objectSpread2({}, CONFIG), {}, { difficulty: DIFFICULTY }));
	}
	exports.answerCard = answerCard;
	exports.apply = apply;
	exports.canResolve = canResolve;
	exports.config = config;
	exports.endSol = endSol;
	exports.evaBanned = evaBanned;
	exports.isPlanValid = isPlanValid;
	exports.newMission = newMission;
	exports.openProblem = openProblem;
	exports.parseMissionsJson = parseMissionsJson;
	exports.pickHistoricalJson = pickHistoricalJson;
	exports.previewSol = previewSol;
	exports.resolveProblem = resolveProblem;
	exports.setProblemProgress = setProblemProgress;
	exports.state = state;
	return exports;
})({});
